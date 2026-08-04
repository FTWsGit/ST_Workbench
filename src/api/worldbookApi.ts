import type { Worldbook, WorldbookEntry } from '../types'
import { ensureTopImporter } from './hostContext'
import { deepClonePlain } from './apiUtils'

/* ====== 世界书 API ======
 * 通过 ensureTopImporter() import ST 的 /scripts/world-info.js 模块获取世界书操作函数
 * （world_names / loadWorldInfo / createNewWorldInfo / saveWorldInfo / deleteWorldInfo）。
 * 状态全在模块实例内部，不发 HTTP 请求。import() 走浏览器原生模块缓存，同一 URL 拿到同一实例，
 * mod.world_names 是 ESM live binding。 */

async function getWorldInfoModule(): Promise<any> {
  const importer = await ensureTopImporter()
  const mod = await importer('/scripts/world-info.js')
  if (!mod || typeof mod.loadWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（/scripts/world-info.js 结构异常，或当前 ST 版本已更新）')
  }
  return mod
}

/* ====== ST 原生世界书格式 ⇄ 工作层 Worldbook 双向转换 ======
 * 字段映射：
 *   - keys（工作层） ⇄ key（原生）
 *   - disabled（工作层） ⇄ disable（原生，语义相同）
 *   - groupPrioritized（工作层） ⇄ groupOverride（原生）
 *   - keyWord（工作层专属）：由 constant/vectorized 派生，写回时丢弃。
 *   - caseSensitive / matchWholeWords：boolean | null，透传。
 * 其余字段（scanDepth/position/role/sticky/cooldown/delay/group/groupWeight/probability 等）
 * 字段名完全一致，用 `{ ...raw }` 打底再覆盖不一致字段，保留未建模进接口的字段。 */
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

/** 按名字读取一份世界书的完整内容。ST 这边名字不存在时 loadWorldInfo 通常返回一个对象，entries为空，
 *  返回 null。 */
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

/** 保存（覆盖写）到指定名字。`data` 必须是纯对象，不能是 Pinia/Vue 响应式引用——
 *  structuredClone 过不了 Vue Proxy，用 deepClonePlain() 兜底。 */
export async function saveWorldbook(data: Worldbook): Promise<void> {
  const mod = await getWorldInfoModule()
  if (typeof mod.saveWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（saveWorldInfo 缺失）')
  }
  const plain = deepClonePlain(data)
  await mod.saveWorldInfo(plain.name, { entries: toSTEntries(plain) })
}

export async function deleteWorldbook(name: string): Promise<void> {
  const mod = await getWorldInfoModule()
  if (typeof mod.deleteWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（deleteWorldInfo 缺失）')
  }
  await mod.deleteWorldInfo(name)
}

interface CharacterBookEntryLike {
  id?: number
  keys?: string[]
  secondary_keys?: string[]
  comment?: string
  content?: string
  constant?: boolean
  selective?: boolean
  insertion_order?: number
  enabled?: boolean
  position?: string // 'before_char' | 'after_char'，规范字段，只有两档
  extensions?: Record<string, any>
  [k: string]: any
}

function fromCharacterBookEntry(raw: CharacterBookEntryLike, fallbackUid: number): WorldbookEntry {
  const ext = raw.extensions ?? {}
  const constant = !!(ext.constant ?? raw.constant)
  const vectorized = !!ext.vectorized
  // 规范 position 只有 before_char(0)/after_char(1) 两档，extensions.position 有 ST 精确数值
  // （0~7，见 types.ts WORLDBOOK_POSITION_OPTIONS）时优先用它。
  const specPosition = raw.position === 'after_char' ? 1 : 0
  return {
    // 未建模进 WorldbookEntry 的字段（addMemo/ignoreBudget/outletName/match*/useGroupScoring/
    // automationId/triggers/characterFilter 等）原样透传，已知字段在下面覆盖——跟 fromSTEntry 的
    // "{...raw} 打底再覆盖"是同一个纪律，不然导入角色卡内嵌书会悄悄丢这些数据。
    ...raw,
    uid: typeof raw.id === 'number' ? raw.id : fallbackUid,
    comment: raw.comment ?? '',
    content: raw.content ?? '',
    displayIndex: typeof ext.display_index === 'number' ? ext.display_index : fallbackUid,
    keys: Array.isArray(raw.keys) ? [...raw.keys] : [],
    keysecondary: Array.isArray(raw.secondary_keys) ? [...raw.secondary_keys] : [],
    selective: !!(ext.selective ?? raw.selective),
    selectiveLogic: (typeof ext.selectiveLogic === 'number' ? ext.selectiveLogic : 0) as 0 | 1 | 2 | 3,
    constant, keyWord: !constant && !vectorized, vectorized,
    disabled: raw.enabled === false || !!ext.disable,
    position: (typeof ext.position === 'number' ? ext.position : specPosition) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
    depth: typeof ext.depth === 'number' ? ext.depth : 4,
    order: typeof ext.order === 'number' ? ext.order : (typeof raw.insertion_order === 'number' ? raw.insertion_order : 100),
    role: (ext.role === 0 || ext.role === 1 || ext.role === 2) ? ext.role : null,
    probability: typeof ext.probability === 'number' ? ext.probability : 100,
    useProbability: ext.useProbability !== false,
    excludeRecursion: !!ext.excludeRecursion,
    preventRecursion: !!ext.preventRecursion,
    delayUntilRecursion: ext.delayUntilRecursion ?? false,
    scanDepth: typeof ext.scanDepth === 'number' ? ext.scanDepth : null,
    caseSensitive: typeof ext.caseSensitive === 'boolean' ? ext.caseSensitive : null,
    matchWholeWords: typeof ext.matchWholeWords === 'boolean' ? ext.matchWholeWords : null,
    group: typeof ext.group === 'string' ? ext.group : '',
    groupPrioritized: !!ext.groupOverride,
    groupWeight: typeof ext.groupWeight === 'number' ? ext.groupWeight : 100,
    sticky: typeof ext.sticky === 'number' ? ext.sticky : null,
    cooldown: typeof ext.cooldown === 'number' ? ext.cooldown : null,
    delay: typeof ext.delay === 'number' ? ext.delay : null,
  }
}

/** 纯转换，不碰 ST——单独导出方便脱离 Vue 用 `npx tsx` 写测试用例。
 *  `fallbackUid` 用条目在数组里的下标兜底——只有当规范字段里没有 `id` 时才会用到。 */
export function importCharacterBookEntries(entries: CharacterBookEntryLike[] | undefined | null): WorldbookEntry[] {
  return (entries ?? []).map((raw, idx) => fromCharacterBookEntry(raw, idx))
}

/** 把角色卡内嵌世界书导入成一份新的独立世界书文件。只负责 ST 端注册 + 写入，不负责加载进
 *  worldbookStore——调用方决定是否接着 getWorldbookByName() 读权威数据。 */
export async function importCharacterBook(name: string, book: { entries?: CharacterBookEntryLike[] } | null | undefined): Promise<void> {
  await createWorldbook(name)
  const entries = importCharacterBookEntries(book?.entries)
  await saveWorldbook({ name, entries })
}
