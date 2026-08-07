/* agent 专用工具注册表。
 *
 * 与 components/toolbox/registry.ts 的 ToolDef 区别：
 *  - 给模型调用，要 JSON Schema、要风险分级、要 execute 函数；
 *  - 形状照 tool call 的形状设计（snake_case name、OpenAI 风格 parameters）。
 *
 * 设计文档 5.1：另开一个注册表，形状类似但不同。
 */
import type { usePresetStore } from '../stores/presetStore'
import type { useWorldbookStore } from '../stores/worldbookStore'
import type { useCharacterStore } from '../stores/characterStore'
import type { useConfirmStore } from '../stores/confirmStore'
import type { useUiStore } from '../stores/uiStore'

/** workspace 名（与 tabsStore.activeWorkspace 同集）。 */
export type AgentWorkspace = 'preset' | 'worldbook' | 'character'

/** 工具执行上下文：注入三个 domain store + confirmStore + uiStore.t。 */
export interface AgentToolContext {
  presetStore: ReturnType<typeof usePresetStore>
  worldbookStore: ReturnType<typeof useWorldbookStore>
  characterStore: ReturnType<typeof useCharacterStore>
  confirmStore: ReturnType<typeof useConfirmStore>
  uiStore: ReturnType<typeof useUiStore>
  /** 当前会话所在 workspace（越界校验用）。 */
  workspace: AgentWorkspace
}

/** 工具执行结果。text 是回给模型的字符串内容。 */
export interface AgentToolResult {
  text: string
  /** 标记错误（如用户拒绝审批、工具抛错）。 */
  isError?: boolean
  /** 终止本轮 agent 循环（如用户拒绝审批——不再让模型继续跑工具/续答，直接停）。 */
  stopTurn?: boolean
}

/** JSON Schema 类型（极简子集，够 OpenAI parameters 用）。 */
export type JsonSchemaObject = {
  type: 'object'
  properties?: Record<string, any>
  required?: string[]
  description?: string
}

/** agent 工具定义。 */
export interface AgentToolDef {
  /** 全局唯一，snake_case，直接就是 tool_calls 里的 function.name。 */
  name: string
  /** 喂给模型的自然语言描述——写清楚"什么时候该用"。 */
  description: string
  /** OpenAI 风格 parameters schema。 */
  parameters: JsonSchemaObject
  /** 风险分级，见模块 7 审批门。 */
  risk: 'safe' | 'risky'
  /** true 才允许并行执行（只读工具）。 */
  readonly: boolean
  /** 限定哪些 workspace 下可调用，越界则拒绝（模块 7.3）。 */
  availableIn: AgentWorkspace[]
  /** 执行函数。args 是已解析的参数对象。 */
  execute: (args: any, ctx: AgentToolContext) => Promise<AgentToolResult>
}

/** 工具注册表：name → def。 */
const AGENT_TOOL_REGISTRY: Map<string, AgentToolDef> = new Map()

/** 注册一个 agent 工具。在工具模块顶层调用一次。重名覆盖。 */
export function registerAgentTool(def: AgentToolDef): void {
  AGENT_TOOL_REGISTRY.set(def.name, def)
}

/** 取单个工具定义。 */
export function getAgentTool(name: string): AgentToolDef | undefined {
  return AGENT_TOOL_REGISTRY.get(name)
}

/** 列出所有已注册工具定义（供 callModel 组装 tools wire format）。 */
export function listAgentTools(): AgentToolDef[] {
  return Array.from(AGENT_TOOL_REGISTRY.values())
}

/** 按 workspace 过滤可用工具（越界的不给模型选）。 */
export function listAgentToolsForWorkspace(ws: AgentWorkspace): AgentToolDef[] {
  return listAgentTools().filter(t => t.availableIn.includes(ws))
}
