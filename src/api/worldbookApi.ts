import type { Worldbook, WorldbookEntry } from '../types';
import { deepClonePlain } from './apiUtils';

/* ====== 世界书 API ======
 * 通过动态 import() 导入 ST 的 /scripts/world-info.js 模块获取世界书操作函数
 * （world_names / loadWorldInfo / createNewWorldInfo / saveWorldInfo / deleteWorldInfo）。
 * 状态全在模块实例内部，不发 HTTP 请求。import() 走浏览器原生模块缓存，同一 URL 拿到同一实例，
 * mod.world_names 是 ESM live binding。 */

async function getWorldInfoModule() {
  const mod = await import(/* @vite-ignore */ '/scripts/world-info.js' as string);
  if (!mod || typeof mod.loadWorldInfo !== 'function') {
    throw new Error(
      'SillyTavern 世界书模块不可用（/scripts/world-info.js 结构异常，或当前 ST 版本已更新）'
    );
  }
  return mod;
}

/* ====== ST 原生世界书格式 ⇄ 工作层 Worldbook 双向转换 ======
 * 干净层 WorldbookEntry 把 ST 原生扁平字段重组成 strategy/position/recursion/effect 四组。
 * 关键映射（原生 → 干净）：
 *   - comment → name；disable → enabled（取反）
 *   - constant/vectorized 两个 bool
 *     （keyword/constant/vectorized）+ keysSecondary
 *   - scanDepth null → 'same_as_global'
 *   - position 数字 0~7 → position.type 字符串枚举
 *   - excludeRecursion/preventRecursion/delayUntilRecursion → recursion.*
 *   - sticky/cooldown/delay → effect.*
 * 未建模的原生字段（group/groupWeight/groupOverride/useProbability/ignoreBudget/addMemo/outletName/
 * automationId/triggers/match* 等）从 raw 透传，见 toSTEntry 的 raw 参数。 */

type PositionType = WorldbookEntry['position']['type'];
type LogicType = WorldbookEntry['strategy']['keysSecondary']['logic'];
type RoleType = Exclude<WorldbookEntry['position']['role'], null>;

const POSITION_TO_TYPE: Record<number, PositionType> = {
  0: 'before_character_definition',
  1: 'after_character_definition',
  2: 'before_author_note',
  3: 'after_author_note',
  4: 'at_depth',
  5: 'before_example_messages',
  6: 'after_example_messages',
  7: 'outlet',
};

const TYPE_TO_POSITION: Record<PositionType, number> = {
  before_character_definition: 0,
  after_character_definition: 1,
  before_author_note: 2,
  after_author_note: 3,
  at_depth: 4,
  before_example_messages: 5,
  after_example_messages: 6,
  outlet: 7,
};

const LOGIC_TO_TYPE: Record<number, LogicType> = {
  0: 'and_any',
  1: 'not_all',
  2: 'not_any',
  3: 'and_all',
};

const TYPE_TO_LOGIC: Record<LogicType, number> = {
  and_any: 0,
  not_all: 1,
  not_any: 2,
  and_all: 3,
};

/* ST 原生 role 是数字（0=system、1=user、2=assistant，见 spec/worldbook.mdc），
 * 工作层 role 是字符串枚举——双向映射与 characterApi 的 DEPTH_PROMPT_ROLE_NUM 同约定。 */
const ROLE_TO_TYPE: Record<number, RoleType> = {
  0: 'system',
  1: 'user',
  2: 'assistant',
};

const TYPE_TO_ROLE: Record<RoleType, number> = {
  system: 0,
  user: 1,
  assistant: 2,
};

function toNumber(v: unknown, dflt: number): number {
  return typeof v === 'number' ? v : dflt;
}

export function fromSTEntry(uidKey: string, raw: Record<string, unknown>): WorldbookEntry {
  const constant = !!raw?.constant;
  const vectorized = !!raw?.vectorized;
  const keysecondary = Array.isArray(raw?.keysecondary) ? raw.keysecondary : [];
  const posNum = toNumber(raw?.position, 0);
  return {
    uid: Number(raw?.uid ?? uidKey),
    name: (raw?.comment ?? '') as string,
    enabled: !raw?.disable,
    content: (raw?.content ?? '') as string,
    strategy: {
      type: constant ? 'constant' : vectorized ? 'vectorized' : 'keyword',
      keys: Array.isArray(raw?.key) ? raw.key : [],
      keysSecondary: {
        logic: LOGIC_TO_TYPE[raw?.selectiveLogic as number] ?? 'and_any',
        keys: keysecondary,
      },
      scanDepth: typeof raw?.scanDepth === 'number' ? raw.scanDepth : ('same_as_global' as const),
      caseSensitive: typeof raw?.caseSensitive === 'boolean' ? raw.caseSensitive : null,
      matchWholeWords: typeof raw?.matchWholeWords === 'boolean' ? raw.matchWholeWords : null,
    },
    position: {
      type: POSITION_TO_TYPE[posNum] ?? 'before_character_definition',
      role: ROLE_TO_TYPE[raw?.role as number] ?? null,
      depth: toNumber(raw?.depth, 4),
      order: toNumber(raw?.order, 100),
    },
    probability: toNumber(raw?.probability, 100),
    recursion: {
      preventIncoming: !!raw?.excludeRecursion,
      preventOutgoing: !!raw?.preventRecursion,
      delayUntil: typeof raw?.delayUntilRecursion === 'number' ? raw.delayUntilRecursion : false,
    },
    effect: {
      sticky: typeof raw?.sticky === 'number' ? raw.sticky : null,
      cooldown: typeof raw?.cooldown === 'number' ? raw.cooldown : null,
      delay: typeof raw?.delay === 'number' ? raw.delay : null,
    },
    _gid: raw?._gid as string | undefined,
    _gname: raw?._gname as string | undefined,
    _gcollapsed: raw?._gcollapsed as boolean | undefined,
    _genabled: raw?._genabled as boolean | undefined,
    _gidx: raw?._gidx as number | undefined,
  };
}

/** 干净 WorldbookEntry → ST 原生条目。`raw` 是该 uid 最近一次读到的原生条目快照，未建模字段
 *  （group/groupWeight/groupOverride/useProbability/ignoreBudget/addMemo/outletName/automationId/
 *  triggers/match* 等）从 raw 透传，已知字段由干净层覆盖。 */
export function toSTEntry(
  entry: WorldbookEntry,
  raw?: Record<string, unknown>
): Record<string, unknown> {
  const keysSecondary = entry.strategy.keysSecondary;
  return {
    ...(raw ?? {}),
    uid: entry.uid,
    comment: entry.name,
    disable: !entry.enabled,
    content: entry.content,
    key: entry.strategy.keys,
    keysecondary: keysSecondary.keys,
    selective: entry.strategy.type === 'keyword',
    selectiveLogic: TYPE_TO_LOGIC[keysSecondary.logic] ?? 0,
    constant: entry.strategy.type === 'constant',
    vectorized: entry.strategy.type === 'vectorized',
    scanDepth: entry.strategy.scanDepth === 'same_as_global' ? null : entry.strategy.scanDepth,
    caseSensitive: entry.strategy.caseSensitive,
    matchWholeWords: entry.strategy.matchWholeWords,
    position: TYPE_TO_POSITION[entry.position.type] ?? 0,
    role: entry.position.role === null ? null : TYPE_TO_ROLE[entry.position.role],
    depth: entry.position.depth,
    order: entry.position.order,
    probability: entry.probability,
    excludeRecursion: entry.recursion.preventIncoming,
    preventRecursion: entry.recursion.preventOutgoing,
    delayUntilRecursion: entry.recursion.delayUntil ?? false,
    sticky: entry.effect.sticky,
    cooldown: entry.effect.cooldown,
    delay: entry.effect.delay,
    _gid: entry._gid,
    _gname: entry._gname,
    _gcollapsed: entry._gcollapsed,
    _genabled: entry._genabled,
    _gidx: entry._gidx,
  };
}

/** 原生 entries Record → 干净 Worldbook。显示顺序按原生 displayIndex（工作层持久化的排序字段，
 *  未建模进干净层）；缺 displayIndex 时按 uid 数值序兜底。 */
export function fromSTWorldbook(
  name: string,
  entriesRecord: Record<string, Record<string, unknown>>
): Worldbook {
  const list = Object.entries(entriesRecord).map(([uidKey, raw]) => ({
    entry: fromSTEntry(uidKey, raw),
    displayIndex:
      typeof raw.displayIndex === 'number' ? raw.displayIndex : Number(raw.uid ?? uidKey),
  }));
  list.sort((a, b) => a.displayIndex - b.displayIndex);
  return { name, entries: list.map((x) => x.entry) };
}

/** 干净 Worldbook → 原生 entries Record。数组顺序 = 显示顺序，写回时据此派生 displayIndex
 *  持久化（干净层不保留该字段）。`raw` 是按 uid 的原生条目快照，用于未建模字段透传。 */
export function toSTEntries(
  wb: Worldbook,
  raw?: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  wb.entries.forEach((e, idx) => {
    entries[String(e.uid)] = { ...toSTEntry(e, raw?.[String(e.uid)]), displayIndex: idx };
  });
  return entries;
}

/** 列出全部世界书名字（不含内容）。返回的是普通数组的拷贝，不是 ST 内部 world_names 的活引用。 */
export async function listWorldbooks(): Promise<string[]> {
  const mod = await getWorldInfoModule();
  return Array.isArray(mod.world_names) ? [...mod.world_names] : [];
}

/** 按名字读取一份世界书的完整内容。ST 这边名字不存在时 loadWorldInfo 通常返回一个对象，entries为空，
 *  返回 null。返回 `{ worldbook: 干净, raw: 原生 entries 快照 }`——raw 供保存时字段级透传。 */
export async function getWorldbookByName(
  name: string
): Promise<{ worldbook: Worldbook; raw: Record<string, Record<string, unknown>> } | null> {
  const mod = await getWorldInfoModule();
  const data = await mod.loadWorldInfo(name);
  if (!data || typeof data !== 'object') return null;
  const raw = deepClonePlain(
    data.entries && typeof data.entries === 'object' ? data.entries : {}
  ) as Record<string, Record<string, unknown>>;
  return { worldbook: fromSTWorldbook(name, raw), raw };
}

/** 新建一份空世界书——只负责在 ST 里注册这个名字，不负责把它加载进 store，调用方自己决定
 *  创建完是否紧接着 loadWorldbookByName()/getWorldbookByName()。 */
export async function createWorldbook(name: string): Promise<void> {
  const mod = await getWorldInfoModule();
  if (typeof mod.createNewWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（createNewWorldInfo 缺失）');
  }
  await mod.createNewWorldInfo(name, { interactive: false });
}

/** 保存（覆盖写）到指定名字。`raw` 是按 uid 的原生条目快照，用于未建模字段透传；
 *  两者都必须是纯对象，不能是 Pinia/Vue 响应式引用——用 deepClonePlain() 兜底。
 *  返回写入的原生 entries 记录（纯对象、非响应式），调用方可保留为更新后的 raw 快照。 */
export async function saveWorldbook(
  wb: Worldbook,
  raw?: Record<string, Record<string, unknown>>
): Promise<Record<string, Record<string, unknown>>> {
  const mod = await getWorldInfoModule();
  if (typeof mod.saveWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（saveWorldInfo 缺失）');
  }
  const plain = deepClonePlain(wb);
  const plainRaw = raw ? deepClonePlain(raw) : undefined;
  const entries = toSTEntries(plain, plainRaw) as Record<string, Record<string, unknown>>;
  await mod.saveWorldInfo(plain.name, { entries });
  return entries;
}

export async function deleteWorldbook(name: string): Promise<void> {
  const mod = await getWorldInfoModule();
  if (typeof mod.deleteWorldInfo !== 'function') {
    throw new Error('SillyTavern 世界书模块不可用（deleteWorldInfo 缺失）');
  }
  await mod.deleteWorldInfo(name);
}

/* ====== 角色卡内嵌书导入 ====== */
interface CharacterBookEntryLike {
  id?: number;
  keys?: string[];
  secondary_keys?: string[];
  comment?: string;
  content?: string;
  constant?: boolean;
  selective?: boolean;
  insertion_order?: number;
  enabled?: boolean;
  position?: string; // 'before_char' | 'after_char'，规范字段，只有两档
  extensions?: Record<string, unknown>;
  [k: string]: unknown;
}

/** 把角色卡内嵌书条目（snake_case 规范形状）归一化成 ST 世界书条目形状（顶层扁平字段 + 数值
 *  position）。extensions 里的精确数值优先于规范字段。白名单输出：只产出 ST 原生字段，
 *  书格式字段（keys/insertion_order/enabled/id 等）不泄漏进产物；干净层未建模的原生字段
 *  （useProbability/group/triggers/match* 等）也一并产出，由 importCharacterBook 作为 raw
 *  传给 saveWorldbook 透传保活。 */
export function characterBookToNative(raw: CharacterBookEntryLike): Record<string, unknown> {
  const ext = raw.extensions ?? {};
  return {
    key: Array.isArray(raw.keys) ? raw.keys : [],
    keysecondary: Array.isArray(raw.secondary_keys) ? raw.secondary_keys : [],
    comment: raw.comment ?? '',
    content: raw.content ?? '',
    constant: !!(ext.constant ?? raw.constant),
    vectorized: !!ext.vectorized,
    selective: !!(ext.selective ?? raw.selective),
    selectiveLogic: typeof ext.selectiveLogic === 'number' ? ext.selectiveLogic : 0,
    disable: raw.enabled === false || !!ext.disable,
    position:
      typeof ext.position === 'number' ? ext.position : raw.position === 'after_char' ? 1 : 0,
    depth: toNumber(ext.depth, 4),
    order: toNumber(ext.order, toNumber(raw.insertion_order, 100)),
    role: ext.role === 0 || ext.role === 1 || ext.role === 2 ? ext.role : null,
    probability: toNumber(ext.probability, 100),
    useProbability: ext.useProbability ?? true,
    excludeRecursion: !!ext.exclude_recursion,
    preventRecursion: !!ext.prevent_recursion,
    delayUntilRecursion: ext.delay_until_recursion ?? false,
    scanDepth: typeof ext.scan_depth === 'number' ? ext.scan_depth : null,
    caseSensitive: typeof ext.case_sensitive === 'boolean' ? ext.case_sensitive : null,
    matchWholeWords: typeof ext.match_whole_words === 'boolean' ? ext.match_whole_words : null,
    sticky: typeof ext.sticky === 'number' ? ext.sticky : null,
    cooldown: typeof ext.cooldown === 'number' ? ext.cooldown : null,
    delay: typeof ext.delay === 'number' ? ext.delay : null,
    displayIndex: typeof ext.display_index === 'number' ? ext.display_index : undefined,
    // —— 干净层未建模、走 raw 透传保活的原生字段（默认值与 ST 前端 convertCharacterBook 一致）——
    addMemo: !!raw.comment,
    outletName: typeof ext.outlet_name === 'string' ? ext.outlet_name : '',
    group: typeof ext.group === 'string' ? ext.group : '',
    groupOverride: !!ext.group_override,
    groupWeight: typeof ext.group_weight === 'number' ? ext.group_weight : 100,
    useGroupScoring: typeof ext.use_group_scoring === 'boolean' ? ext.use_group_scoring : null,
    automationId: typeof ext.automation_id === 'string' ? ext.automation_id : '',
    triggers: Array.isArray(ext.triggers) ? ext.triggers : [],
    ignoreBudget: !!ext.ignore_budget,
    matchPersonaDescription: !!ext.match_persona_description,
    matchCharacterDescription: !!ext.match_character_description,
    matchCharacterPersonality: !!ext.match_character_personality,
    matchCharacterDepthPrompt: !!ext.match_character_depth_prompt,
    matchScenario: !!ext.match_scenario,
    matchCreatorNotes: !!ext.match_creator_notes,
    extensions: raw.extensions ?? {},
  };
}

export function fromCharacterBookEntry(
  raw: CharacterBookEntryLike,
  fallbackUid: number
): WorldbookEntry {
  const native = characterBookToNative(raw);
  const uid = typeof raw.id === 'number' ? raw.id : fallbackUid;
  return fromSTEntry(String(uid), native);
}

/** 纯转换，不碰 ST——单独导出方便脱离 Vue 用 `npx tsx` 写测试用例。
 *  `fallbackUid` 用条目在数组里的下标兜底——只有当规范字段里没有 `id` 时才会用到。 */
export function importCharacterBookEntries(
  entries: CharacterBookEntryLike[] | undefined | null
): WorldbookEntry[] {
  return (entries ?? []).map((raw, idx) => fromCharacterBookEntry(raw, idx));
}

/** 把角色卡内嵌世界书导入成一份新的独立世界书文件。只负责 ST 端注册 + 写入，不负责加载进
 *  worldbookStore——调用方决定是否接着 getWorldbookByName() 读权威数据。
 *  干净层未建模的原生字段经 characterBookToNative 产物当 raw 传给 saveWorldbook 透传保活。 */
export async function importCharacterBook(
  name: string,
  book: { entries?: CharacterBookEntryLike[] } | null | undefined
): Promise<void> {
  await createWorldbook(name);
  const list = book?.entries ?? [];
  const entries = importCharacterBookEntries(list);
  const raw: Record<string, Record<string, unknown>> = {};
  list.forEach((e, idx) => {
    raw[String(typeof e.id === 'number' ? e.id : idx)] = characterBookToNative(e);
  });
  await saveWorldbook({ name, entries }, raw);
}
