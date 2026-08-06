/* agent 持久化读写层。
 *
 * 走 SillyTavern 官方给扩展预留的 extensionSettings 通道（服务端 settings.json 同级），
 * 跟 characterApi.ts/presetApi.ts 同一套接入模式：ensureTopImporter() 顶层动态 import。
 *
 * 纪律：
 *  - 写入前 deepClonePlain()，绝不把 Pinia 响应式对象塞进 extension_settings；
 *  - 读出来也过一次 deepClonePlain()，避免 agentStore 跟原始对象引用共享；
 *  - 命名空间键唯一不通用（ST_Workbench_Agent）。
 */
import { ensureTopImporter } from './hostContext'
import { deepClonePlain } from './apiUtils'
import { AGENT_NS, AGENT_PERSISTED_VERSION } from '../agent/constants'
import type { AgentPersisted } from '../agent/types'
import { DEFAULT_AGENT_PERSISTED } from '../agent/defaultPersisted'

async function getExtensionSettingsModule(): Promise<any> {
  const importer = await ensureTopImporter()
  const mod = await importer('/scripts/extensions.js')
  if (!mod || typeof mod.extension_settings !== 'object') {
    throw new Error('SillyTavern 扩展设置模块不可用（/scripts/extensions.js 结构异常，或当前 ST 版本已更新）')
  }
  return mod
}

async function getSaveSettingsFn(): Promise<() => void> {
  const importer = await ensureTopImporter()
  const scriptMod = await importer('/script.js')
  if (typeof scriptMod.saveSettingsDebounced !== 'function') {
    throw new Error('SillyTavern 设置保存函数不可用（saveSettingsDebounced 缺失）')
  }
  return scriptMod.saveSettingsDebounced
}

/** 加载 agent 持久化数据。首次访问时初始化默认结构。 */
export async function loadAgentStore(): Promise<AgentPersisted> {
  const { extension_settings } = await getExtensionSettingsModule()
  if (!extension_settings[AGENT_NS]) {
    extension_settings[AGENT_NS] = deepClonePlain(DEFAULT_AGENT_PERSISTED)
  }
  const stored = extension_settings[AGENT_NS]
  // 版本不匹配时显式抛错，调用方决定给用户重置按钮还是别的处理
  if (typeof stored?.version !== 'number' || stored.version !== AGENT_PERSISTED_VERSION) {
    throw new AgentVersionMismatchError(stored?.version, AGENT_PERSISTED_VERSION)
  }
  // 合并默认字段（向前兼容新增字段），再深拷贝断引用
  return deepClonePlain({ ...DEFAULT_AGENT_PERSISTED, ...stored })
}

/** 保存 agent 持久化数据（patch 合并写回）。调用方保证 patch 是纯对象。 */
export async function saveAgentStore(patch: Partial<AgentPersisted>): Promise<void> {
  const { extension_settings } = await getExtensionSettingsModule()
  if (!extension_settings[AGENT_NS]) {
    extension_settings[AGENT_NS] = deepClonePlain(DEFAULT_AGENT_PERSISTED)
  }
  Object.assign(extension_settings[AGENT_NS], deepClonePlain(patch))
  const saveSettingsDebounced = await getSaveSettingsFn()
  saveSettingsDebounced()
}

/** 强制重置 agent 持久化数据为默认结构。用户在版本不匹配报错时点"重置"触发。 */
export async function resetAgentStore(): Promise<AgentPersisted> {
  const { extension_settings } = await getExtensionSettingsModule()
  const fresh = deepClonePlain(DEFAULT_AGENT_PERSISTED)
  extension_settings[AGENT_NS] = fresh
  const saveSettingsDebounced = await getSaveSettingsFn()
  saveSettingsDebounced()
  return deepClonePlain(fresh)
}

/** 版本不匹配错误，调用方可以 instanceof 判断。 */
export class AgentVersionMismatchError extends Error {
  readonly storedVersion: unknown
  readonly expectedVersion: number
  constructor(storedVersion: unknown, expectedVersion: number) {
    super(`Agent 数据版本不匹配（存储=${String(storedVersion)}，期望=${expectedVersion}）。请重置 agent 数据。`)
    this.name = 'AgentVersionMismatchError'
    this.storedVersion = storedVersion
    this.expectedVersion = expectedVersion
  }
}
