/* 上下文管理（模块 6 裁剪版）。
 *
 * 三层：
 *  1. 神圣前缀：system persona + 第一条真实 user 消息，压缩永不触碰；
 *  2. 入库截断（入口闸门）：所有 tool_result 写入前过字节上限；
 *  3. 整段摘要压缩：estimateTokens(messages) >= COMPACT_THRESHOLD_TOKENS 时触发。
 *
 * 设计文档 6.1/6.2。
 */
import {
  TOOL_RESULT_TRUNCATE_BYTES,
  COMPACT_THRESHOLD_TOKENS,
  SUMMARY_FIDELITY_RATIO,
  SACRED_PREFIX_MESSAGES,
  TOKEN_BYTES_ESTIMATE,
  ACTIVE_SESSION_SOFT_LIMIT_BYTES,
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
 * 执行摘要压缩。
 *
 * 1. 抽取 [sacredFloor, drainTo) 区间的消息；
 * 2. 调 LLM 生成摘要（走 callModelRaw 纯文本调用，不接 tools）；
 * 3. 把抽干区间替换成一条 synthetic user 消息（带 framing）。
 *
 * 超时回退：SUMMARY_TIMEOUT_MS 内没拿到摘要，直接用"[早期上下文已省略]"占位。
 */
export async function compactMessages(
  messages: Message[],
  generateSummary: (toSummarize: Message[]) => Promise<string>,
): Promise<Message[]> {
  if (!(await shouldCompact(messages))) return messages

  const { sacredFloor, drainTo } = await computeCompactRange(messages)
  if (drainTo <= sacredFloor) return messages

  // 抽取要摘要的消息
  const toSummarize = messages.slice(sacredFloor, drainTo)

  // 生成摘要（带超时回退）
  let summary: string
  try {
    summary = await withTimeout(
      generateSummary(toSummarize),
      60_000, // SUMMARY_TIMEOUT_MS
    )
  } catch {
    // 超时或失败：用占位文本
    summary = '[早期上下文已省略，如需要请重新查询]'
  }

  // 构造合成 user 消息（带 framing）
  const syntheticMsg: Message = {
    role: 'user',
    text: `以下是早期对话的摘要，供参考：\n\n${summary}`,
    synthetic: true,
    meta: { timestamp: Date.now() },
  }

  // 替换抽干区间：保留 [0, sacredFloor) + syntheticMsg + [drainTo, end)
  return [
    ...messages.slice(0, sacredFloor),
    syntheticMsg,
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
 * 只保留神圣前缀 + 当前这一轮，其余全部换成占位文本。
 * 不重试第二次（本产品不是长跑 agent，用户可以直接开新会话）。
 */
export function overflowFallback(messages: Message[]): Message[] {
  const sacredFloor = sacredFloorLength(messages)
  if (sacredFloor >= messages.length) return messages

  const omitted: Message = {
    role: 'user',
    text: '[早期上下文已省略，如需要请重新查询]',
    synthetic: true,
    meta: { timestamp: Date.now() },
  }

  return [
    ...messages.slice(0, sacredFloor),
    omitted,
    ...messages.slice(sacredFloor), // 保留神圣前缀之后的全部（当前轮）
  ]
}
