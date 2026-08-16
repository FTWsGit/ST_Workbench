/* VFS Resource Layer 公共类型：VfsResolver 行为契约 + 公共信封形状。
 *
 * 这里只定义"怎么被找到 / 怎么调用"的行为契约，不定义"返回什么数据结构"（见 decision 0004：
 * 三个 domain 底层读写机制不同，不强行统一数据形状）。resolver 内部形状可以完全不同，
 * 只要满足 list/get/write/create/remove/search 这套行为接口。
 */
import type { Workspace } from '../../types';
import type { AliasTable } from './aliasTable';
import type { usePresetStore } from '../../stores/presetStore';
import type { useWorldbookStore } from '../../stores/worldbookStore';
import type { useCharacterStore } from '../../stores/characterStore';
import type { useUiStore } from '../../stores/uiStore';
import type { SearchQuery } from './searchQuery';

export type PresetStore = ReturnType<typeof usePresetStore>;
export type WorldbookStore = ReturnType<typeof useWorldbookStore>;
export type CharacterStore = ReturnType<typeof useCharacterStore>;
export type UiStore = ReturnType<typeof useUiStore>;

/** 执行上下文：注入三个 domain store + uiStore（varResolver 读变量索引用）+ session 级 alias 表。
 *  resolver 只调用 store 现有字段/方法，不把 Vue store 对象透传给模型。 */
export interface VfsContext {
  presetStore: PresetStore;
  worldbookStore: WorldbookStore;
  characterStore: CharacterStore;
  uiStore: UiStore;
  aliasTable: AliasTable;
}

/* ====== FieldSpec：字段声明表 ======
 * 每个 collection 提供一份 FieldSpec[]，是"可寻址字段"的唯一真相源：
 *  - list(item) 输出的字段名来自这份声明，不是 Object.keys(运行时对象)。
 *  - edit/set 的字段合法性以它为准：字段不在表里 → 报错，不透传写入。
 *  - kind='text' 走唯一子串替换；kind='scalar'/'enum' 走直接 set（enum 额外校验取值）。 */

export type FieldKind = 'text' | 'scalar' | 'enum';

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  /** kind='enum' 时：取值白名单（字符串化）。 */
  enumValues?: string[];
  /** kind='scalar' 时：期望值形状，用于 set 时校验。 */
  valueKind?: 'boolean' | 'number' | 'string';
  /** true = 只读（可 list/get，不可写）。 */
  readonly?: boolean;
}

/** collection 怎么寻址它的 item：aliased 用短别名（有 ground-truth 稳定 id），positional 用下标。 */
export type IdKind = 'aliased' | 'positional';

/* ====== 变更描述（ChangeOperation）======
 * 现在只定义类型、每次写类操作顺手记一条，不建 undo/redo/rollback 引擎。为未来 diff/跳转 UI 铺路。 */

export type ChangeOperation =
  | { kind: 'set_field'; path: string; before: unknown; after: unknown }
  | { kind: 'create'; path: string; after: unknown }
  | { kind: 'delete'; path: string; before: unknown };

/* ====== 写入操作 ====== */

export type FieldWrite =
  /** 文本字段：唯一子串替换。old 必须在当前字段值里恰好出现 1 次。 */
  | { op: 'replace'; old: string; newValue: string }
  /** scalar/enum 字段：直接整值 set。 */
  | { op: 'set'; value: unknown };

/* ====== list 结构化输出 ====== */

export interface ListCollectionRow {
  name: string;
  idKind: IdKind;
}

export interface ListItemRow {
  /** 短别名（aliased）或下标字符串（positional）。 */
  alias: string;
  name: string;
  /** 摘要字段 key → 字符串化值。 */
  summary: Record<string, string>;
}

export interface ListFieldRow {
  key: string;
  kind: FieldKind;
  enumValues?: string[];
  valueKind?: 'boolean' | 'number' | 'string';
  readonly?: boolean;
}

export type VfsListNode =
  | { type: 'collections'; collections: ListCollectionRow[] }
  | { type: 'items'; items: ListItemRow[] }
  | { type: 'fields'; fields: ListFieldRow[] };

/* ====== 统一结果信封 ====== */

export interface VfsResult {
  ok: boolean;
  /** !ok 时的错误文案（回给模型的 actionable 信息）。 */
  error?: string;
  /** CLI 风格文本（模型只读这个）。 */
  text?: string;
  /** 结构化数据（UI / 未来 MCP consumer 读这个）。 */
  structured?: unknown;
  /** 本次调用产生的变更（只记录，不驱动 undo/redo）。 */
  changes?: ChangeOperation[];
}

/* ====== Resolver 行为契约 ====== */

export interface VfsResolver {
  workspace: Workspace;

  /** 列出 segments 指向节点的子节点（子 collection / items / 字段名）。 */
  list(segments: string[], ctx: VfsContext): VfsResult;

  /** 读取 segments 指向叶子的值。容器 get 报错并提示 list。 */
  get(segments: string[], ctx: VfsContext): VfsResult;

  /** 写入叶子：text 唯一子串替换（replace）或 scalar/enum 直接 set。 */
  write(segments: string[], write: FieldWrite, ctx: VfsContext): VfsResult;

  /** 在 segments 指向的 collection 上创建新 item，返回新 path。 */
  create(segments: string[], fields: Record<string, unknown>, ctx: VfsContext): VfsResult;

  /** 删除 segments 指向的 item。 */
  remove(segments: string[], ctx: VfsContext): VfsResult;

  /** 在 segments 指向的 collection 上搜索。 */
  search(segments: string[], query: SearchQuery, ctx: VfsContext): VfsResult;

  /** 对 search 命中的文本字段做唯一子串替换（dry_run 只算不写）。 */
  replace(
    segments: string[],
    query: SearchQuery,
    old: string,
    newValue: string,
    dryRun: boolean,
    ctx: VfsContext
  ): VfsResult;

  /** 对 search 命中的项 set 标量/枚举字段（dry_run 只算不写）。 */
  modify(
    segments: string[],
    query: SearchQuery,
    field: string,
    value: unknown,
    dryRun: boolean,
    ctx: VfsContext
  ): VfsResult;
}
