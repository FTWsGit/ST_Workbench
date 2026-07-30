import type { PresetData } from '../types'
import { getCtx, ensureTopImporter } from './hostContext'
import { deepClonePlain } from './apiUtils'

/* ====== PresetManager ======
 * 一律走 ST 的 PresetManager.getPresetList() 获取完整预设列表，而非读 ctx.chatCompletionSettings
 * （后者只对应当前选中的预设）。显式请求 'openai' PresetManager——ST 按 API 类型维护独立的
 * PresetManager，无参版本解析到当前 UI 主 API，可能不是 chat-completion。 */
function getPresetManager(): any {
  const ctx = getCtx()
  const pm = ctx.getPresetManager?.('openai')
  if (!pm) throw new Error('SillyTavern context 不可用（getPresetManager 缺失，或当前 ST 版本 API 不同）')
  return pm
}

export interface PresetListEntry {
  name: string
  index: number
}

/** 列出全部 Chat Completion 预设（不是只有当前选中的那个）。 */
export function listPresets(): PresetListEntry[] {
  const pm = getPresetManager()
  const list = pm.getPresetList?.()
  const names = list?.preset_names
  if (!names || typeof names !== 'object') throw new Error('无法获取预设列表（getPresetList 结构异常，ST 版本可能已更新）')
  return Object.entries(names).map(([name, index]) => ({ name, index: index as number }))
}

/** ST 当前在自己 UI 里选中的预设名——仅用作"首次打开面板时默认加载哪个"的初始值，
 *  不代表我们这边接下来只能操作这一个预设。 */
export function getSelectedPresetName(): string {
  const pm = getPresetManager()
  return pm.getSelectedPresetName?.() || ''
}

/** 按名字读取指定预设的完整数据，可以是任意一个预设。优先用 `getCompletionPresetByName`，
 *  拿不到时从 `getPresetList()` 按名字查下标取元素。 */
export function getPresetByName(name: string): PresetData | null {
  const pm = getPresetManager()
  let preset: any = typeof pm.getCompletionPresetByName === 'function'
    ? pm.getCompletionPresetByName(name)
    : null
  if (!preset) {
    const list = pm.getPresetList?.()
    const idx = list?.preset_names?.[name]
    if (typeof idx === 'number') preset = list.presets?.[idx]
  }
  if (!preset || !Array.isArray(preset.prompts) || !Array.isArray(preset.prompt_order)) return null
  // Deep-clone into a plain object before handing it back — both lookup paths above can return
  // ST's own live (possibly Vue-reactive) object, and we never want to hold or pass around
  // someone else's reactive reference (see savePresetAs() below for why that specifically bites).
  return deepClonePlain(preset) as PresetData
}

/** 切换 ST 当前选中的预设。不切换的话外部函数（如 window.SillyTavern.generate()）会沿用旧的
 *  选中预设生成，但切换本身较慢。 */

export function selectPresetByName(name: string): boolean {
  const pm = getPresetManager()
  try {
    let id = pm.findPreset(name)
    pm.selectPreset(id)
  } catch {return false}

  return true
}

/** 保存到指定名字的预设——不要求是当前选中的那个。
 *
 * `data` 必须是纯对象，不能是 Pinia/Vue 的活跃响应式引用：`structuredClone()` 克隆不了 Vue
 * 的 Proxy，且 ST 可能在克隆前就把引用赋值进自身状态导致 Proxy 残留。调用方应先
 * `deepClonePlain()`，这里再断言一次双重保险。 */
export async function savePresetAs(name: string, data: PresetData): Promise<void> {
  const pm = getPresetManager()
  if (typeof pm.savePreset !== 'function') throw new Error('SillyTavern context 不可用（savePreset 缺失）')
  const plain = deepClonePlain(data)
  await Promise.resolve(pm.savePreset(name, plain))
}

export async function deletePreset(name: string): Promise<void> {
  const pm = getPresetManager()
  if (typeof pm.deletePreset !== 'function') throw new Error('SillyTavern context 不可用（deletePreset 缺失）')
  await Promise.resolve(pm.deletePreset(name))
}

export interface RenderedMsg {
  role: string
  content: string
  tokens: number
  identifier: string
}

/** 按 identifier 分组返回真实渲染后的消息（宏/正则/插件都已处理）。每次调用触发一次新的
 *  dry-run，不复用旧数据。依赖 openai.js 内部实现，ST 版本更新可能失效。 */
export async function getPromptManagerMessages(): Promise<Record<string, RenderedMsg[]>> {
  const ctx = getCtx()
  if (typeof ctx.generate !== 'function') throw new Error('SillyTavern context 不可用（ctx.generate 缺失）')
  const importer = await ensureTopImporter()

  await ctx.generate('normal', {}, true)

  const module = await importer('/scripts/openai.js')
  const pm = module?.setupChatCompletionPromptManager?.()
  if (!pm?.messages?.collection) {
    throw new Error('promptManager.messages 结构异常，ST 版本可能已更新（方案B失效，需要重新翻源码确认）')
  }

  const results: Record<string, RenderedMsg[]> = {}
  for (const item of pm.messages.collection as any[]) {
    if (!item) continue // null = 这个位置在本次生成里被跳过（禁用/无内容）
    results[item.identifier] = (item.collection || []).map((m: any) => ({
      role: m.role,
      content: m.content ?? '',
      tokens: m.tokens ?? 0,
      identifier: m.identifier,
    }))
  }
  return results
}

export interface RawRequestMessage {
  role: string
  content: string
}

/* ====== 精确预览：整体原文（CHAT_COMPLETION_SETTINGS_READY 事件）======
 * 必须跑一次真实的 `ctx.generate('normal')`（非 dry-run），并监听 CHAT_COMPLETION_SETTINGS_READY
 * 事件——该事件在请求体最终组装完成、即将发给 API 之前触发，`completion.messages` 即真正会发出去的
 * 消息。拿到后立刻 `ctx.stopGeneration()` 中断真实生成，避免 API 调用产生费用/等待。 */
export async function getFinalRequestMessages(): Promise<RawRequestMessage[]> {
  const ctx = getCtx()
  if (typeof ctx.generate !== 'function') throw new Error('SillyTavern context 不可用（ctx.generate 缺失）')
  if (!ctx.eventSource || !ctx.event_types?.CHAT_COMPLETION_SETTINGS_READY) {
    throw new Error('SillyTavern context 不可用（eventSource/event_types 缺失，或当前不是 Chat Completion 模式）')
  }

  const evt = ctx.event_types.CHAT_COMPLETION_SETTINGS_READY
  const src = ctx.eventSource
  const useOnce = typeof src.once === 'function'

  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      if (!useOnce) { try { src.removeListener?.(evt, handler) ?? src.off?.(evt, handler) } catch {} }
    }
    const handler = (completion: any) => {
      if (settled) return
      settled = true
      // Cut the real generation off right away — we only wanted the outgoing request payload,
      // not to actually spend API time/tokens on a completion nobody asked for. Whatever
      // rejection this causes on the ctx.generate() promise below is harmless: `settled` is
      // already true by the time it lands, so that .catch() is a no-op.
      try { ctx.stopGeneration?.() } catch {}
      cleanup()
      const msgs = Array.isArray(completion?.messages) ? completion.messages : []
      resolve(msgs.map((m: any) => ({
        role: m?.role || '',
        content: typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '', null, 2),
      })))
    }
    timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { ctx.stopGeneration?.() } catch {}
      cleanup()
      reject(new Error('等待 CHAT_COMPLETION_SETTINGS_READY 超时（可能没有配置好可用的 API 连接，或当前不是 Chat Completion 模式）'))
    }, 20000)

    if (useOnce) src.once(evt, handler)
    else src.on(evt, handler)

    ctx.generate('normal').catch((e: any) => {
      if (settled) return
      settled = true
      cleanup()
      reject(e instanceof Error ? e : new Error(String(e)))
    })
  })
}
