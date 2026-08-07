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

/** 一块知识包（用户写，可在 UI 里单独开关）。enabled=false 时不注入到 system 消息。 */
export interface KnowledgeBlock {
  /** 块名（UI 展示用，如 "mvu"、"ejs"）。 */
  name: string
  /** 一句话描述（UI 展示用）。 */
  description: string
  /** 正文（system 角色注入的领域知识）。 */
  content: string
  /** false 时跳过注入。 */
  enabled: boolean
}

/** 提示词分块结构——把硬编码集中到一处，用户可逐块编辑。 */
export interface PromptBlocks {
  /** 系统提示词：你是谁、你做什么（基础 persona）。 */
  system: string
  /** 项目提示词（用户写）：当前创作目标、能做什么、不能做什么。 */
  project: string
  /** Workflow 提示词：贴合 tools 的工作流程建议（如先 list 再 read 再 edit）。 */
  workflow: string
  /** 知识块列表，每块带 enabled 开关——只 enabled 的才注入。 */
  knowledge: KnowledgeBlock[]
  /** Runtime 提示词：当前工作区 runtime 上下文（如打开了哪个 preset）。运行时注入，不持久化用户文本。 */
  runtime: string
}

/** agent 用户可调配置。 */
export interface AgentConfig {
  /** 提示词分块（系统/项目/Workflow/知识/runtime）。 */
  prompts: PromptBlocks
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
  /** 思考模式开关。'enabled' 让模型输出思考过程。 */
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
  | 'canceled'        // 用户拒绝审批，直接停本轮

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

/** 默认 agent 配置。提示词正文走 DEFAULT_AGENT_PROMPTS（constants.ts），这里只引用。 */
import { DEFAULT_AGENT_PROMPTS } from './constants'

/** 默认 agent 配置。 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  prompts: { ...DEFAULT_AGENT_PROMPTS, knowledge: [] },
  temperature: 1.0,
  maxTokens: 8192,
  topP: null,
  topK: null,
  presencePenalty: null,
  frequencyPenalty: null,
  thinking: {type: 'enabled'},
  maxContextTokens: 256_000,
  compactThresholdRatio: 0.7,
}
