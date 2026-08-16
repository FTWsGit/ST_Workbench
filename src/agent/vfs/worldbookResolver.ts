/* worldbook resolver：/worldbook 工作区的资源树。
 *
 *   /worldbook            → collections: entries
 *   /worldbook/entries    → aliased 条目（uid 为 ground-truth id）
 *   /worldbook/entries/{alias}/{field}
 *
 * FieldSpec 是 40+ 底层字段里"显式声明可寻址"的白名单：list(item) 只列出这些，edit/set 只接受这些。
 * 嵌套字段用点路径 key（strategy.keys / position.type 等），getField/setField 走 getPath/setPath。
 */
import type { WorldbookEntry } from '../../types';
import { WORLDBOOK_POSITION_OPTIONS } from '../../types';
import type { FieldSpec } from './types';
import { makeAliasedResolver, workspaceResolver } from './collection';
import type { CollectionAdapter } from './collection';
import { flattenOrderIds, removeIdentifierFromOrder } from './order';
import { getPath, setPath } from './objectPath';

const NOT_LOADED = '当前没有加载任何世界书。';

const POSITION_TYPES: string[] = WORLDBOOK_POSITION_OPTIONS.map((o) => o.value);

const ENTRY_FIELDS: FieldSpec[] = [
  { key: 'name', kind: 'text' },
  { key: 'content', kind: 'text' },
  { key: 'enabled', kind: 'scalar', valueKind: 'boolean' },
  { key: 'strategy.type', kind: 'enum', enumValues: ['keyword', 'constant', 'vectorized'] },
  { key: 'strategy.scanDepth', kind: 'scalar', valueKind: 'number' },
  { key: 'position.type', kind: 'enum', enumValues: POSITION_TYPES },
  { key: 'position.role', kind: 'enum', enumValues: ['system', 'user', 'assistant'] },
  { key: 'position.depth', kind: 'scalar', valueKind: 'number' },
  { key: 'position.order', kind: 'scalar', valueKind: 'number' },
  { key: 'probability', kind: 'scalar', valueKind: 'number' },
];

function emptyEntry(uid: number): WorldbookEntry {
  return {
    uid,
    name: '',
    enabled: true,
    content: '',
    strategy: {
      type: 'keyword',
      keys: [],
      keysSecondary: { logic: 'and_any', keys: [] },
      scanDepth: 'same_as_global',
      caseSensitive: null,
      matchWholeWords: null,
    },
    position: {
      type: 'before_character_definition',
      role: null,
      depth: 4,
      order: 100,
    },
    probability: 100,
    recursion: { preventIncoming: false, preventOutgoing: false, delayUntil: false },
    effect: { sticky: null, cooldown: null, delay: null },
  };
}

const entriesAdapter: CollectionAdapter = {
  name: 'entries',
  fields: ENTRY_FIELDS,
  searchFields: [
    { key: 'content', kind: 'text' },
    { key: 'name', kind: 'text' },
    { key: 'strategy.keys', kind: 'list' },
    { key: 'strategy.type', kind: 'enum' },
    { key: 'enabled', kind: 'enum' },
  ],
  summaryKeys: ['enabled', 'position.type'],
  notLoadedError: NOT_LOADED,
  items(ctx): Record<string, unknown>[] | null {
    const store = ctx.worldbookStore;
    if (!store.worldbookName) return null;
    const byId = new Map(store.entries.map((e) => [String(e.uid), e]));
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const id of flattenOrderIds(store.order)) {
      const e = byId.get(id);
      if (e && !seen.has(id)) {
        out.push(e as unknown as Record<string, unknown>);
        seen.add(id);
      }
    }
    for (const e of store.entries) {
      if (!seen.has(String(e.uid))) {
        out.push(e as unknown as Record<string, unknown>);
        seen.add(String(e.uid));
      }
    }
    return out;
  },
  realIdOf(item) {
    return String((item as unknown as WorldbookEntry).uid);
  },
  nameOf(item) {
    const e = item as unknown as WorldbookEntry;
    return e.name || String(e.uid);
  },
  getField(item, key) {
    return getPath(item, key);
  },
  setField(item, key, value) {
    return setPath(item, key, value);
  },
  createItem(fields, ctx) {
    const store = ctx.worldbookStore;
    const uid = store.entries.reduce((m, e) => Math.max(m, e.uid), -1) + 1;
    const entry = emptyEntry(uid);
    entry.name = String(fields.comment ?? fields.name ?? '').trim();
    entry.content = String(fields.content ?? '');
    if (Array.isArray(fields.keys)) entry.strategy.keys = fields.keys.map(String);
    if (typeof fields.position === 'string' && POSITION_TYPES.includes(fields.position as string)) {
      entry.position.type = fields.position as WorldbookEntry['position']['type'];
    }
    store.entries.push(entry);
    store.order.push({ identifier: String(uid), enabled: true });
    store.markDirty();
    return String(uid);
  },
  removeItem(realId, ctx) {
    const store = ctx.worldbookStore;
    const idx = store.entries.findIndex((e) => String(e.uid) === realId);
    if (idx < 0) return false;
    store.entries.splice(idx, 1);
    store.order = removeIdentifierFromOrder(store.order, realId);
    store.markDirty();
    return true;
  },
  markDirty(ctx) {
    ctx.worldbookStore.markDirty();
  },
};

export const worldbookResolver = workspaceResolver('worldbook', {
  entries: makeAliasedResolver('worldbook', entriesAdapter),
});
