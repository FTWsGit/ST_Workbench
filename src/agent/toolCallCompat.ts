/* 极简 tool-call 提取层（非流式，按需扩展 family）。
 *
 * 设计文档 3.1.1：本产品先只做非流式，只需要覆盖用户 ST 当前配置的 chat_completion_source。
 * toolCallCompat.ts 覆盖范围已对齐源码（OpenAI/Claude/Cohere 三族的非流式 tool_calls 提取路径）。
 */

/** 归一化后的 tool call。 */
export interface NormalizedToolCall {
  id: string
  name: string
  /** 原始 JSON 字符串参数，不预解析（弱模型容错）。 */
  arguments: string
}

/** 标准化 source 名，判断是否 OpenAI 系。 */
function isOpenAIFamily(source: string): boolean {
  return [
    'openai', 'openrouter', 'custom', 'azure_openai', 'deepseek',
    'xai', 'groq', 'mistralai', 'cohere', 'perplexity', 'google',
  ].includes(source)
}

/** 从原始响应里抠出 tool_calls。返回 null 表示这次响应没有 tool call。 */
export function extractToolCalls(response: any, source: string): NormalizedToolCall[] | null {
  if (!response) return null

  // OpenAI 系：choices[0].message.tool_calls
  if (isOpenAIFamily(source)) {
    const calls = response?.choices?.[0]?.message?.tool_calls
    if (!Array.isArray(calls) || calls.length === 0) return null
    return calls.map((c: any) => ({
      id: String(c.id ?? ''),
      name: String(c.function?.name ?? ''),
      arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments ?? {}),
    })).filter(c => c.id && c.name)
  }

  // Claude：content 里 type==='tool_use' 的块
  if (source === 'claude') {
    const blocks = Array.isArray(response?.content)
      ? response.content.filter((b: any) => b && b.type === 'tool_use')
      : []
    if (blocks.length === 0) return null
    return blocks.map((b: any) => ({
      id: String(b.id ?? ''),
      name: String(b.name ?? ''),
      arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input ?? {}),
    })).filter((c: NormalizedToolCall) => c.id && c.name)
  }

  // Cohere：message.tool_calls
  if (source === 'cohere') {
    const calls = response?.message?.tool_calls
    if (!Array.isArray(calls) || calls.length === 0) return null
    return calls.map((c: any) => ({
      id: String(c.id ?? ''),
      name: String(c.name ?? ''),
      arguments: typeof c.parameters === 'string' ? c.parameters : JSON.stringify(c.parameters ?? {}),
    })).filter(c => c.id && c.name)
  }

  // makersuite/vertexai 等按需补，MVP 阶段先返回 null
  return null
}
