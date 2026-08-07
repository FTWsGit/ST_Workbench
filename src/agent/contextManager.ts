/* 上下文管理（模块 6 裁剪版）。
 *
 * 三层：
 *  1. 神圣前缀：system persona + 第一条真实 user 消息，压缩永不触碰；
 *  2. 入库截断（入口闸门）：所有 tool_result 写入前过字节上限；
 *  3. 整段摘要压缩：estimateTokens(messages) >= COMPACT_THRESHOLD_TOKENS 时触发。
 *
 * overflow 兜底也走 compact（而非把 history 干没）；compact 失败重试 3 次；
 * summary 只针对 user/assistant 原文，tool_result 按体积折叠或原样保留。
 */
import {
  TOOL_RESULT_TRUNCATE_BYTES,
  COMPACT_THRESHOLD_TOKENS,
  SUMMARY_FIDELITY_RATIO,
  SACRED_PREFIX_MESSAGES,
  TOKEN_BYTES_ESTIMATE,
  ACTIVE_SESSION_SOFT_LIMIT_BYTES,
  SUMMARY_TIMEOUT_MS,
  COMPACT_MAX_RETRIES,
  SUMMARY_TOO_BIG_PREFIX,
} from './constants'
import { getCtx } from '../api/hostContext'
import type { Message } from './types'

/* ====== Token 计数 ======
 * 用 SillyTavern 自己的 tokenizer（getContext().getTokenCountAsync）精确计数，
 * 比字节估算准得多。拿不到 ctx / 调用失败时回退字节估算，保证不阻塞主流程。
 */

/** 把 messages 拼成一段文本用于 tokenizer 计数。 */
function messagesToText(messages: Message[]): string {
  let s = ''
  for (const m of messages) {
    s += m.text
    if (m.toolCalls) {
      for (const tc of m.toolCalls) {
        s += tc.arguments + tc.name
      }
    }
  }
  return s
}

/** 字节估算回退（1 token ≈ 4 字节）。 */
export function estimateTokens(messages: Message[]): number {
  const text = messagesToText(messages)
  return Math.ceil(text.length / TOKEN_BYTES_ESTIMATE)
}

/** 单条消息字节估算（computeCompactRange 内部按消息粒度数 token 用）。 */
function estimateMessageTokens(m: Message): number {
  let len = m.text.length
  if (m.toolCalls) {
    for (const tc of m.toolCalls) len += tc.arguments.length + tc.name.length
  }
  return Math.ceil(len / TOKEN_BYTES_ESTIMATE)
}

/** messages 总字节数。 */
export function estimateBytes(messages: Message[]): number {
  return messagesToText(messages).length
}

let cachedGetTokenCountAsync: ((str: string, padding?: number) => Promise<number>) | null = null
let tokenFnProbed = false

/** 取 ST tokenizer 函数（缓存）。拿不到返回 null。 */
function getStTokenFn(): ((str: string, padding?: number) => Promise<number>) | null {
  if (tokenFnProbed) return cachedGetTokenCountAsync
  tokenFnProbed = true
  try {
    const ctx = getCtx()
    const fn = ctx?.getTokenCountAsync
    if (typeof fn === 'function') cachedGetTokenCountAsync = fn.bind(ctx)
  } catch { /* 回退字节估算 */ }
  return cachedGetTokenCountAsync
}

/**
 * 精确计 messages 的 token 数（异步，走 ST tokenizer）。
 * 失败/拿不到 ctx 时回退 estimateTokens，绝不抛错阻塞主流程。
 */
export async function countTokensAsync(messages: Message[]): Promise<number> {
  const fn = getStTokenFn()
  if (!fn) return estimateTokens(messages)
  try {
    const text = messagesToText(messages)
    const n = await fn(text)
    return typeof n === 'number' && n > 0 ? n : estimateTokens(messages)
  } catch {
    return estimateTokens(messages)
  }
}

/**
 * 单条消息精确 token（异步）。
 * computeCompactRange 需要按消息粒度数 token，这里给一个 per-message 版本。
 */
async function countMessageTokensAsync(m: Message): Promise<number> {
  return countTokensAsync([m])
}

/* ====== 入库截断 ====== */

/** 入库截断：tool_result 写入前过字节上限。超过则截断并加标记。 */
export function truncateForStorage(text: string): string {
  if (text.length <= TOOL_RESULT_TRUNCATE_BYTES) return text
  const cut = TOOL_RESULT_TRUNCATE_BYTES
  return text.slice(0, cut) + `\n…[truncated, original ${text.length} bytes]`
}

/* ====== 神圣前缀 ====== */

/** 神圣前缀长度：system persona + 第一条真实 user 消息（设计文档 3.2 sacredFloor）。 */
export function sacredFloorLength(messages: Message[]): number {
  // 找到第一条真实 user 消息（非 synthetic）的索引
  let firstUserIdx = -1
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user' && !messages[i].synthetic) {
      firstUserIdx = i
      break
    }
  }
  if (firstUserIdx < 0) return SACRED_PREFIX_MESSAGES
  // 神圣前缀 = system 消息（0 到 firstUserIdx-1）+ 第一条 user 消息（firstUserIdx）
  // 即 firstUserIdx + 1 条消息（包含 system persona 和第一条 user）
  return Math.min(messages.length, firstUserIdx + 1)
}

/* ====== 摘要判定与折叠 ====== */

/**
 * 把一条消息降级成"折叠"形态：只留前若干字节 + 标记，不再 summary。
 * 用于 compact 时 tool_result 超长但又确实在抽干区间里——折叠保留开头供模型辨认，
 * 不进 LLM summary（tool_result 摘要没有信息价值，模型自己就知道刚做了什么）。
 */
function foldToolResult(m: Message): Message {
  const cut = SUMMARY_TOO_BIG_PREFIX
  const text = m.text.length > cut
    ? m.text.slice(0, cut) + `\n…[folded, original ${m.text.length} bytes]`
    : m.text
  return { ...m, text, synthetic: true }
}

/**
 * 抽干区间分两路：
 *  - user/assistant 原文 → 喂给 LLM 生成摘要（有信息价值）；
 *  - tool/tool_result → 折叠或原样保留（不 summary）。
 * 返回「要摘要的原文」+「折叠后直接保留的消息」。
 */
function splitForCompact(range: Message[]): { toSummarize: Message[]; folded: Message[] } {
  const toSummarize: Message[] = []
  const folded: Message[] = []
  for (const m of range) {
    if (m.role === 'user' || m.role === 'assistant') {
      toSummarize.push(m)
    } else {
      // tool_result：超过折叠阈值才折叠，否则原样保留
      folded.push(m.text.length > SUMMARY_TOO_BIG_PREFIX ? foldToolResult(m) : m)
    }
  }
  return { toSummarize, folded }
}

/* ====== 整段摘要压缩 ====== */

/**
 * 检查是否需要触发摘要压缩（async，走 ST tokenizer 精确计数）。
 *
 * 触发条件（任一）：
 *  1. countTokensAsync(messages) >= compactThreshold；
 *  2. estimateBytes(messages) >= ACTIVE_SESSION_SOFT_LIMIT_BYTES。
 *
 * compactThreshold 由调用方传入（config.maxContextTokens * config.compactThresholdRatio），
 * 传 0 / 未配置时回落到常数 COMPACT_THRESHOLD_TOKENS。
 */
export async function shouldCompact(
  messages: Message[],
  compactThreshold: number = COMPACT_THRESHOLD_TOKENS,
): Promise<boolean> {
  if (messages.length <= SACRED_PREFIX_MESSAGES + 2) return false
  const tokens = await countTokensAsync(messages)
  if (tokens >= compactThreshold) return true
  const bytes = estimateBytes(messages)
  if (bytes >= ACTIVE_SESSION_SOFT_LIMIT_BYTES) return true
  return false
}

/**
 * 计算摘要压缩的抽干区间 [sacredFloor, drainTo)（async，按精确 token 数算保真窗口）。
 *
 * 保真窗口：保留最近 N% token 的原文，其余抽干成摘要。
 */
export async function computeCompactRange(
  messages: Message[],
): Promise<{ sacredFloor: number; drainTo: number }> {
  const sacredFloor = sacredFloorLength(messages)
  if (sacredFloor >= messages.length) {
    return { sacredFloor, drainTo: messages.length }
  }

  // 保真窗口：最近 N% 的消息（按 token 数算）
  const totalTokens = await countTokensAsync(messages)
  const fidelityTokens = Math.floor(totalTokens * SUMMARY_FIDELITY_RATIO)

  // 从末尾往前数，累计 token 到 fidelityTokens 为止
  let accumulated = 0
  let drainTo = messages.length
  for (let i = messages.length - 1; i >= sacredFloor; i--) {
    const msgTokens = await countTokensAsync([messages[i]])
    if (accumulated + msgTokens > fidelityTokens && i < messages.length - 1) {
      drainTo = i + 1
      break
    }
    accumulated += msgTokens
    drainTo = i
  }

  // 确保 drainTo >= sacredFloor，且至少留一条消息给摘要替换
  if (drainTo <= sacredFloor) drainTo = sacredFloor + 1
  if (drainTo > messages.length) drainTo = messages.length

  return { sacredFloor, drainTo }
}

/**
 * 执行摘要压缩（带重试）。
 *
 * 1. 抽取 [sacredFloor, drainTo) 区间的消息；
 * 2. tool_result 折叠/保留，user/assistant 喂给 LLM 生成摘要；
 * 3. 摘要失败重试 COMPACT_MAX_RETRIES 次，全失败才回退占位文本；
 * 4. 把抽干区间替换成一条 synthetic system 消息（带 <previous_summary> tag）+ 折叠消息。
 *
 * 若之前已有摘要，叠加新摘要而非蒸馏旧摘要（保留更远历史的关键事实）。
 */
export async function compactMessages(
  messages: Message[],
  generateSummary: (toSummarize: Message[], prevSummary: string | null) => Promise<string>,
): Promise<Message[]> {
  if (!(await shouldCompact(messages))) return messages

  const { sacredFloor, drainTo } = await computeCompactRange(messages)
  if (drainTo <= sacredFloor) return messages

  // 抽取要处理的区间
  const range = messages.slice(sacredFloor, drainTo)
  if (range.length === 0) return messages

  // 分两路：user/assistant → summary；tool → 折叠/保留
  const { toSummarize, folded } = splitForCompact(range)

  // 找已有摘要（前一次 compact 产生的 synthetic system 消息），叠加而非蒸馏
  let prevSummary: string | null = null
  for (let i = 0; i < sacredFloor; i++) {
    const m = messages[i]
    if (m.role === 'system' && m.synthetic && m.text.includes('<previous_summary>')) {
      prevSummary = m.text
      break
    }
  }

  // 生成摘要（带重试 + 超时回退）
  let summary: string | null = null
  for (let attempt = 1; attempt <= COMPACT_MAX_RETRIES; attempt++) {
    try {
      summary = await withTimeout(
        generateSummary(toSummarize, prevSummary),
        SUMMARY_TIMEOUT_MS,
      )
      if (summary) break
    } catch {
      // 重试
    }
  }
  if (!summary) {
    summary = prevSummary ?? '[早期上下文已省略，如需要请重新查询]'
  }

  // 构造合成 system 消息（带 <previous_summary> tag 包裹）
  const syntheticMsg: Message = {
    role: 'system',
    text: `<previous_summary>\n${summary}\n</previous_summary>`,
    synthetic: true,
    meta: { timestamp: Date.now() },
  }

  // 替换抽干区间：保留 [0, sacredFloor) + syntheticMsg + folded + [drainTo, end)
  // 删掉前一次的 summary 消息（如果有，已被新摘要叠加取代）
  const head = messages.slice(0, sacredFloor).filter(
    m => !(m.role === 'system' && m.synthetic && m.text.includes('<previous_summary>'))
  )
  return [
    ...head,
    syntheticMsg,
    ...folded,
    ...messages.slice(drainTo),
  ]
}

/** 带超时的 Promise 包装。 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    promise
      .then(result => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch(err => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/* ====== 溢出兜底 ====== */

/**
 * 溢出兜底：模型/API 直接拒绝请求（上下文超窗）时调用。
 *
 * 走 compactMessages（而非把 history 干没）——溢出说明上下文确实超窗，
 * 但用户的历史仍有价值，压缩成摘要保留。compactMessages 内部已有重试/折叠/叠加。
 * compact 后若仍超窗，由调用方决定是否再调一次或停。
 */
export async function overflowFallback(
  messages: Message[],
  generateSummary: (toSummarize: Message[], prevSummary: string | null) => Promise<string>,
): Promise<Message[]> {
  return compactMessages(messages, generateSummary)
}
