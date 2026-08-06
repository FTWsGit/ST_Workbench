/* LLM 调用层（方案 A：CHAT_COMPLETION_SETTINGS_READY 注入 tools）。
 *
 * 设计文档 3.1 方案 A：监听 CHAT_COMPLETION_SETTINGS_READY 事件，在请求体组装完成、即将发 API
 * 之前把 tools 塞进去。源码已证实引用同一性（openai.js:3052 emit 后 3055 直接 JSON.stringify
 * 进 fetch，无克隆），可按方案 A 实现。
 *
 * 上层接口：callModel(store) → Promise<ModelTurnResult>，工具循环代码不关心走 A 还是 B。
 */
import { getCtx } from '../api/hostContext'
import { extractToolCalls } from './toolCallCompat'
import type { ToolCall } from './types'

/** 单次模型调用的归一化结果。 */
export interface ModelTurnResult {
  /** assistant 消息内容（可能为空，纯 tool call 场景）。 */
  content: string
  /** 解析出的 tool_calls，没有则 null。 */
  toolCalls: ToolCall[] | null
  /** 原始响应对象（调试/扩展用）。 */
  raw?: any
}

/** 判断是否 OpenAI 系（与 toolCallCompat 保持同一清单）。 */
function isOpenAIFamilyInternal(source: string): boolean {
  return [
    'openai', 'openrouter', 'custom', 'azure_openai', 'deepseek',
    'xai', 'groq', 'mistralai', 'cohere', 'perplexity', 'google',
  ].includes(source)
}

/** 把内部 Message[] 渲染成发给 provider 的请求消息数组（OpenAI wire format）。 */
export function renderMessages(messages: Array<{ role: string; text: string; toolCallId?: string; toolCalls?: ToolCall[] }>): any[] {
  return messages.map(m => {
    if (m.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: m.text,
      }
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: m.text || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }
    }
    return { role: m.role, content: m.text }
  })
}

/** 把 AgentToolDef[] 转成 OpenAI tools wire format。 */
function buildToolsWire(tools: any[]): any[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

/**
 * 调用模型一次。方案 A：监听 CHAT_COMPLETION_SETTINGS_READY 注入 tools。
 *
 * @param messages 当前会话消息序列（已过 renderMessages 序列化）
 * @param tools 可用工具清单（empty 表示纯文本生成，不注入 tools）
 * @param config agent 配置（temperature/maxTokens 等）
 */
export async function callModelRaw(
  messages: any[],
  tools: any[],
  config: { temperature: number; maxTokens: number },
): Promise<ModelTurnResult> {
  const ctx = getCtx()
  if (!ctx) throw new Error('SillyTavern context 不可用（getContext 缺失）')

  const eventTypes = ctx.event_types
  const eventSource = ctx.eventSource
  if (!eventTypes || !eventSource) {
    throw new Error('SillyTavern eventSource 不可用')
  }

  const CHAT_COMPLETION_SETTINGS_READY = eventTypes.CHAT_COMPLETION_SETTINGS_READY
  if (!CHAT_COMPLETION_SETTINGS_READY) {
    throw new Error('SillyTavern 不支持 CHAT_COMPLETION_SETTINGS_READY 事件')
  }

  const prompt = messages

  // 准备 tools 注入（方案 A：在 CHAT_COMPLETION_SETTINGS_READY 回调里 mutate generate_data）
  const toolsWire = tools.length > 0 ? buildToolsWire(tools) : null

  const handler = (generateData: any) => {
    if (!generateData || typeof generateData !== 'object') return
    if (toolsWire) {
      generateData.tools = toolsWire
      generateData.tool_choice = 'auto'
    }
    if (config.temperature != null) generateData.temperature = config.temperature
    if (config.maxTokens != null) generateData.max_tokens = config.maxTokens
  }

  // 注册 once 监听器（在请求发出前一刻触发）
  const useOnce = typeof eventSource.once === 'function'
  if (useOnce) {
    eventSource.once(CHAT_COMPLETION_SETTINGS_READY, handler)
  } else {
    eventSource.on(CHAT_COMPLETION_SETTINGS_READY, handler)
  }

  let response: any
  try {
    // generateRawData 返回原始 response object（含 choices/message/tool_calls）
    if (typeof ctx.generateRawData === 'function') {
      response = await ctx.generateRawData({ prompt })
    } else if (typeof ctx.generateRaw === 'function') {
      // 兜底：generateRaw 只返回抽取后的字符串，会丢 tool_calls
      const text = await ctx.generateRaw({ prompt })
      response = { choices: [{ message: { content: text } }] }
    } else {
      throw new Error('SillyTavern context 不可用（generateRawData/generateRaw 缺失）')
    }
  } finally {
    if (!useOnce) {
      try { eventSource.removeListener?.(CHAT_COMPLETION_SETTINGS_READY, handler) } catch {}
    }
  }

  const source = ctx.chatCompletionSource || ctx.chat_completion_source || 'openai'
  const toolCalls = extractToolCallsInternal(response, source)

  let content = ''
  if (isOpenAIFamilyInternal(source)) {
    content = String(response?.choices?.[0]?.message?.content ?? '')
  } else if (source === 'claude') {
    const textBlocks = Array.isArray(response?.content)
      ? response.content.filter((b: any) => b && b.type === 'text')
      : []
    content = textBlocks.map((b: any) => String(b.text ?? '')).join('\n')
  } else if (source === 'cohere') {
    content = String(response?.text ?? response?.message?.content ?? '')
  } else {
    content = String(response?.choices?.[0]?.message?.content ?? response?.content ?? '')
  }

  return { content, toolCalls, raw: response }
}

function extractToolCallsInternal(response: any, source: string): ToolCall[] | null {
  const raw = extractToolCalls(response, source)
  if (!raw || raw.length === 0) return null
  return raw.map(r => ({
    id: r.id,
    name: r.name,
    arguments: r.arguments,
  }))
}
