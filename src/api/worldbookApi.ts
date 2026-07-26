import type { Worldbook, WorldbookEntry } from '../types'
import { ensureTopImporter } from './hostContext'
import { deepClonePlain } from './apiUtils'

/* ====== 世界书 API ======
 * 【2026-07 修正】世界书不是 REST /api/worldinfo/* 接口——那是我们最早逆向时搞错的，ST 自己
 * 前端从来没这么调用过。真实机制是 `/scripts/world-info.js` 这个 ESM 模块自己导出的函数
 * （world_names / loadWorldInfo / createNewWorldInfo / saveWorldInfo / deleteWorldInfo），
 * 状态全在这个模块实例内部，前端直接调用它们，不发 HTTP 请求到那几个路径。
 *
 * 跟 presetApi.ts 里 getPromptManagerMessages() 拿 '/scripts/openai.js' 是同一个套路：用
 * hostContext.ts 的 ensureTopImporter()（顶层文档动态 import 助手，见那边的 doc comment），
 * 不能自己在 iframe 里裸 `import('/scripts/world-info.js')`——路径会按 iframe 的
 * about:srcdoc 假 origin 解析，大概率失败或者拿到错误的模块实例。
 *
 * `ensureTopImporter()` 底层的 `import()` 走浏览器原生模块缓存，同一个 URL 重复 import() 拿到
 * 的是同一个模块命名空间对象，`mod.world_names` 是 ESM 的 live binding，ST 内部
 * createNewWorldInfo/deleteWorldInfo 改了那个数组之后，我们这边不用重新 import 就能读到最新值。 */

async function getWorldInfoModule(): Promise<any> {
  const importer = await ensureTopImporter()
  const mod = await importer('/scripts/world-info.js')
  if (!mod || typeof mod.loadWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（/scripts/world-info.js 结构异常，或当前 ST 版本已更新）')
  }
  return mod
}

/* ====== ST 原生世界书格式 ⇄ 工作层 Worldbook 双向转换 ======
 * 字段名差异（2026-07 修正版，之前版本这里全错了）：
 *   - keys（工作层） ⇄ key（原生，字符串数组，只是名字不一样）
 *   - disabled（工作层） ⇄ disable（原生，语义相同：都是 true=禁用，不是反的——之前误以为原生
 *     叫 enabled 且语义相反，其实字段名和语义只有名字对不上，值不用取反）
 *   - groupPrioritized（工作层） ⇄ groupOverride（原生，只是名字不一样，语义相同）
 *   - keyWord（工作层专属）：原生没有这个字段，constant/vectorized 都为 false 时代表关键词激活，
 *     转换时派生出来；写回原生格式时直接丢弃。
 *   - caseSensitive / matchWholeWords：两边都是 `boolean | null`，null = 跟随全局设置，字段名和
 *     取值语义两边一致，不需要转换，直接透传。
 * 其余字段（scanDepth/position/role/sticky/cooldown/delay/group/groupWeight/probability/
 * useProbability/excludeRecursion/preventRecursion/delayUntilRecursion 等）两边字段名完全一致，
 * 用 `{ ...raw }` 打底再覆盖上面几个不一致的字段，而不是逐字段白名单搬运——这样
 * automationId/useGroupScoring/matchPersonaDescription 这类没建模进 WorldbookEntry 接口的
 * 字段能原样透传保留，一次读-改-存往返不会被悄悄丢掉。 */
function fromSTEntry(uidKey: string, raw: any): WorldbookEntry {
  const constant = !!raw?.constant
  const vectorized = !!raw?.vectorized
  return {
    ...raw,
    uid: Number(raw?.uid ?? uidKey),
    keys: Array.isArray(raw?.key) ? raw.key : [],
    keysecondary: Array.isArray(raw?.keysecondary) ? raw.keysecondary : [],
    constant,
    vectorized,
    keyWord: !constant && !vectorized,
    disabled: !!raw?.disable,
    groupPrioritized: !!raw?.groupOverride,
    displayIndex: typeof raw?.displayIndex === 'number' ? raw.displayIndex : 0,
  }
}

function toSTEntry(entry: WorldbookEntry): any {
  const { keys, keyWord, disabled, groupPrioritized, ...rest } = entry
  return {
    ...rest,
    key: keys,
    disable: disabled,
    groupOverride: groupPrioritized,
  }
}

function fromSTWorldbook(name: string, data: any): Worldbook {
  const rec = data?.entries
  const list: WorldbookEntry[] = rec && typeof rec === 'object'
    ? Object.entries(rec).map(([uidKey, raw]) => fromSTEntry(uidKey, raw))
    : []
  list.sort((a, b) => (a.displayIndex ?? 0) - (b.displayIndex ?? 0))
  return { name, entries: list }
}

/** entries 的 displayIndex 字段由调用方（worldbookStore）在保存前根据当前的 order 树（含展开
 *  折叠组）重新算好写入每个 entry，这里只管原样按 uid 打包成 Record，不重新计算顺序。 */
function toSTEntries(wb: Worldbook): Record<string, any> {
  const entries: Record<string, any> = {}
  wb.entries.forEach(e => { entries[String(e.uid)] = toSTEntry(e) })
  return entries
}

/** 列出全部世界书名字（不含内容）。返回的是普通数组的拷贝，不是 ST 内部 world_names 的活引用。 */
export async function listWorldbooks(): Promise<string[]> {
  const mod = await getWorldInfoModule()
  return Array.isArray(mod.world_names) ? [...mod.world_names] : []
}

/** 按名字读取一份世界书的完整内容。ST 这边名字不存在时 loadWorldInfo 通常返回空/undefined，
 *  两种都当"不存在"处理，返回 null。 */
export async function getWorldbookByName(name: string): Promise<Worldbook | null> {
  const mod = await getWorldInfoModule()
  const data = await mod.loadWorldInfo(name)
  if (!data || typeof data !== 'object') return null
  return fromSTWorldbook(name, data)
}

/** 新建一份空世界书——只负责在 ST 里注册这个名字，不负责把它加载进 store，调用方自己决定
 *  创建完是否紧接着 loadWorldbookByName()/getWorldbookByName()。 */
export async function createWorldbook(name: string): Promise<void> {
  const mod = await getWorldInfoModule()
  if (typeof mod.createNewWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（createNewWorldInfo 缺失）')
  }
  await mod.createNewWorldInfo(name, { interactive: false })
}

/** 保存（覆盖写）到指定名字。`data` 必须是纯对象，不能是 Pinia/Vue 的活跃响应式引用，理由跟
 *  presetApi.ts savePresetAs() 一样（structuredClone 过不了 Vue Proxy），这里用
 *  deepClonePlain() 兜底。
 *  存完之后重新 loadWorldInfo() 一次丢弃结果——纯粹是让 ST 自己模块内部的缓存跟这次写入保持
 *  一致（见 PROJECT.md「关键设计要点」第7条：改完世界书要重新 loadWorldInfo 刷新本地缓存，
 *  不然后续别的地方基于 ST 自己缓存的读操作可能还看到旧数据），失败了也不影响这次保存本身，
 *  所以吞掉错误不抛出。 */
export async function saveWorldbook(data: Worldbook): Promise<void> {
  const mod = await getWorldInfoModule()
  if (typeof mod.saveWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（saveWorldInfo 缺失）')
  }
  const plain = deepClonePlain(data)
  await mod.saveWorldInfo(plain.name, { entries: toSTEntries(plain) })
  await mod.loadWorldInfo(plain.name).catch(() => {})
}

export async function deleteWorldbook(name: string): Promise<void> {
  const mod = await getWorldInfoModule()
  if (typeof mod.deleteWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（deleteWorldInfo 缺失）')
  }
  await mod.deleteWorldInfo(name)
}
