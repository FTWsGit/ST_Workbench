/* agent 子系统的类型定义。与 agent-system-design.md 模块 2.1 的 Message/ToolCall 形状一致。 */

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface Message {
  role: Role
  text: string
  /** tool 角色消息关联的 tool_call_id。 */
  toolCallId?: string
  /** 标记错误类 tool 消息（如用户拒绝审批、工具抛错）。 */
  isError?: boolean
  /** assistant 消息携带的 tool_calls。 */
  toolCalls?: ToolCall[]
  /** 摘要注入、compaction 提示等合成消息打这个标记。 */
  synthetic?: boolean
  meta?: { timestamp: number }
}

export interface ToolCall {
  id: string
  name: string
  /** 原始 JSON 字符串，不预解析（弱模型容错）。 */
  arguments: string
}

/** 会话索引（轻量，不含消息正文）。 */
export interface AgentSessionMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  /** 会话发起时所在工作区，仅用于 UI 展示/筛选。 */
  workspace: 'preset' | 'worldbook' | 'character' | null
}

/** agent 用户可调配置。 */
export interface AgentConfig {
  /** 系统提示词  */
  systemPrompt: string
  /** 生成温度。 */
  temperature: number
  /** 最大生成 token 数。 */
  maxTokens: number
  /** nucleus sampling：top_p（0-1）。null 表示不注入。 */
  topP: number | null
  /** top-k 采样（部分模型支持，Claude/OpenRouter 等）。null 表示不注入。 */
  topK: number | null
  /** presence_penalty（-2 到 2）。null 表示不注入。 */
  presencePenalty: number | null
  /** frequency_penalty（-2 到 2）。null 表示不注入。 */
  frequencyPenalty: number | null
  /** 思考模式开关。null 表示不注入；'enabled' 让模型输出思考过程。 */
  thinking: { type: 'enabled' } | null
  /** 模型最大上下文 token 数（用户配置）。0 表示未配置，compact 回落常数阈值。 */
  maxContextTokens: number
  /** compact 触发比例（0-1）：上下文占 maxContextTokens 的多少就压缩。0 表示未配置。 */
  compactThresholdRatio: number
}

/** 持久化到 extensionSettings 的完整数据结构。 */
export interface AgentPersisted {
  version: number
  config: AgentConfig
  sessions: AgentSessionMeta[]
  activeSessionId: string | null
  /** 当前活跃会话的完整消息序列——唯一允许变大的字段，靠容量纪律控制。 */
  activeSessionMessages: Message[]
}

/** 回合状态机（简化版，砍掉 compact/cancel 精细状态）。 */
export type AgentTurnState =
  | 'idle'
  | 'thinking'        // 调用 LLM 中
  | 'tool_loop'       // 执行工具中（含 pending 审批子态）
  | 'pending_approval' // 等待用户审批 risky 工具
  | 'error'
  | 'complete'

/** 当前回合的运行时状态（纯内存，不持久化）。 */
export interface AgentRuntimeState {
  turnState: AgentTurnState
  /** 当前正在执行的工具名（UI 反馈用）。 */
  currentTool: string | null
  /** 当前回合已执行的工具轮数。 */
  toolRounds: number
  /** 是否正在等待审批。 */
  awaitingApproval: boolean
  /** 错误信息（turnState === 'error' 时）。 */
  error: string | null
}

/** 默认 agent 配置。 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  systemPrompt: '',
  temperature: 1.0,
  maxTokens: 8192,
  topP: null,
  topK: null,
  presencePenalty: null,
  frequencyPenalty: null,
  thinking: null,
  maxContextTokens: 0,
  compactThresholdRatio: 0,
}
