import type { Component } from 'vue'
import type { LocaleKey } from '../../i18n'

/** 工具出现的"场景"：按 (workspace, sidebarCollection) 维度组织可用工具清单。
 *  preset 有 'items'/'regex'，character 有 'fields'/'regex'，worldbook 只有 'items'。 */
export interface ToolScene {
  workspace: 'preset' | 'worldbook' | 'character'
  collection: 'items' | 'fields' | 'regex'
}

/** 一个可用工具的定义。labelKey 是工具切换 tab 的 i18n 标签（由注册方提供），
 *  component 是工具面板 .vue 组件，挂载时统一传 scene/workspace/collection 三个 props。 */
export interface ToolDef {
  id: string
  labelKey: LocaleKey
  component: Component
}

/** 注册表：workspace → collection → 工具列表。启动期由各工具模块调用 registerTool 填表，
 *  不要直接 mutate 这张表。目前为空——'search'/'batch' 等条目由另一只 subagent 注册。 */
export const TOOL_REGISTRY: Record<string, Record<string, ToolDef[]>> = {}

/** 注册一个工具。在工具模块顶层调用一次即可（避免调用方直接改 TOOL_REGISTRY）。 */
export function registerTool(workspace: string, collection: string, def: ToolDef): void {
  if (!TOOL_REGISTRY[workspace]) TOOL_REGISTRY[workspace] = {}
  const list = TOOL_REGISTRY[workspace][collection]
  if (list) list.push(def)
  else TOOL_REGISTRY[workspace][collection] = [def]
}

/** 查询某个场景当前可用的工具列表。未注册过任何工具的 (workspace, collection) 返回空数组。 */
export function getToolsForScene(workspace: ToolScene['workspace'], collection: ToolScene['collection']): ToolDef[] {
  return TOOL_REGISTRY[workspace]?.[collection] ?? []
}
