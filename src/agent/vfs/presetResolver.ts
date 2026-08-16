/* preset resolver：/preset 工作区的资源树。
 *
 *   /preset               → collections: prompts, regexs, scripts, meta
 *   /preset/prompts       → aliased prompt blocks（identifier 为 ground-truth id）
 *   /preset/regexs        → 正则脚本（宿主 preset）
 *   /preset/scripts       → 酒馆脚本（宿主 preset）
 *   /preset/meta/{field}  → 预设模型参数（单例文档，无 alias 段）
 *
 * 字段声明（FieldSpec[]）是唯一真相源：list(item) 输出、edit/set 校验都以它为准，不透传未声明字段。
 */
import type { PromptBlock } from '../../types';
import type { VfsContext, FieldSpec } from './types';
import { makeAliasedResolver, makeSingletonResolver, workspaceResolver } from './collection';
import type { CollectionAdapter, SingletonAdapter } from './collection';
import { makeRegexCollection } from './regexResolver';
import { makeScriptCollection } from './scriptResolver';
import { flattenOrderIds, removeIdentifierFromOrder } from './order';

const NOT_LOADED = '当前没有加载任何预设。';

const PROMPT_FIELDS: FieldSpec[] = [
  { key: 'name', kind: 'text' },
  { key: 'content', kind: 'text' },
  { key: 'role', kind: 'enum', enumValues: ['system', 'user', 'assistant'] },
  { key: 'enabled', kind: 'scalar', valueKind: 'boolean' },
  { key: 'injectionPosition', kind: 'scalar', valueKind: 'number' },
  { key: 'injectionDepth', kind: 'scalar', valueKind: 'number' },
  { key: 'injectionOrder', kind: 'scalar', valueKind: 'number' },
];

const META_FIELDS: FieldSpec[] = [
  { key: 'temperature', kind: 'scalar', valueKind: 'number' },
  { key: 'openai_max_context', kind: 'scalar', valueKind: 'number' },
  { key: 'openai_max_tokens', kind: 'scalar', valueKind: 'number' },
  { key: 'n', kind: 'scalar', valueKind: 'number' },
  { key: 'stream_openai', kind: 'scalar', valueKind: 'boolean' },
  { key: 'frequency_penalty', kind: 'scalar', valueKind: 'number' },
  { key: 'presence_penalty', kind: 'scalar', valueKind: 'number' },
  { key: 'top_p', kind: 'scalar', valueKind: 'number' },
  { key: 'repetition_penalty', kind: 'scalar', valueKind: 'number' },
  { key: 'min_p', kind: 'scalar', valueKind: 'number' },
  { key: 'top_k', kind: 'scalar', valueKind: 'number' },
  { key: 'top_a', kind: 'scalar', valueKind: 'number' },
  { key: 'seed', kind: 'scalar', valueKind: 'number' },
  { key: 'squash_system_messages', kind: 'scalar', valueKind: 'boolean' },
];

const promptsAdapter: CollectionAdapter = {
  name: 'prompts',
  fields: PROMPT_FIELDS,
  searchFields: [
    { key: 'content', kind: 'text' },
    { key: 'name', kind: 'text' },
    { key: 'role', kind: 'enum' },
    { key: 'enabled', kind: 'enum' },
  ],
  summaryKeys: ['enabled', 'role'],
  notLoadedError: NOT_LOADED,
  items(ctx: VfsContext): Record<string, unknown>[] | null {
    const store = ctx.presetStore;
    if (!store.presetName) return null;
    // 折叠无关的顺序：按 order 树深度优先展平，忽略 hidden 块（hidden 不参与装配/寻址）。
    const byId = new Map(store.prompts.filter((p) => !p.hidden).map((p) => [p.identifier, p]));
    const seen = new Set<string>();
    const out: Record<string, unknown>[] = [];
    for (const id of flattenOrderIds(store.order)) {
      const b = byId.get(id);
      if (b && !seen.has(id)) {
        out.push(b as unknown as Record<string, unknown>);
        seen.add(id);
      }
    }
    // 兜底：prompts 里非 hidden 且不在 order 里的（异常态，防丢）。
    for (const p of store.prompts) {
      if (!p.hidden && !seen.has(p.identifier)) {
        out.push(p as unknown as Record<string, unknown>);
        seen.add(p.identifier);
      }
    }
    return out;
  },
  realIdOf(item) {
    return (item as unknown as PromptBlock).identifier;
  },
  nameOf(item) {
    const b = item as unknown as PromptBlock;
    return b.name || b.identifier;
  },
  getField(item, key) {
    return (item as Record<string, unknown>)[key];
  },
  setField(item, key, value) {
    (item as Record<string, unknown>)[key] = value;
    return true;
  },
  createItem(fields, ctx) {
    const store = ctx.presetStore;
    const id = 'custom_' + Date.now();
    const role = ['system', 'user', 'assistant'].includes(String(fields.role))
      ? (fields.role as PromptBlock['role'])
      : 'system';
    const block: PromptBlock = {
      identifier: id,
      name: String(fields.name ?? '').trim() || 'New Block',
      role,
      content: String(fields.content ?? ''),
      system_prompt: false,
      marker: false,
      enabled: true,
      injectionPosition: 0,
      injectionDepth: 0,
      injectionOrder: 0,
    };
    store.prompts.push(block);
    store.order.push({ identifier: id, enabled: true });
    store.markDirty();
    return id;
  },
  removeItem(realId, ctx) {
    const store = ctx.presetStore;
    const idx = store.prompts.findIndex((p) => p.identifier === realId);
    if (idx < 0) return false;
    if (store.prompts[idx].marker) return false; // marker 块不可删
    store.prompts.splice(idx, 1);
    store.order = removeIdentifierFromOrder(store.order, realId);
    store.markDirty();
    return true;
  },
  markDirty(ctx) {
    ctx.presetStore.markDirty();
  },
};

const metaAdapter: SingletonAdapter = {
  name: 'meta',
  fields: META_FIELDS,
  notLoadedError: NOT_LOADED,
  get(ctx) {
    const store = ctx.presetStore;
    return store.presetName ? (store.settings as unknown as Record<string, unknown>) : null;
  },
  markDirty(ctx) {
    ctx.presetStore.markDirty();
  },
};

export const presetResolver = workspaceResolver(
  'preset',
  {
    prompts: makeAliasedResolver('preset', promptsAdapter),
    regexs: makeAliasedResolver(
      'preset',
      makeRegexCollection((ctx) => ctx.presetStore, NOT_LOADED)
    ),
    scripts: makeAliasedResolver(
      'preset',
      makeScriptCollection((ctx) => ctx.presetStore, NOT_LOADED)
    ),
    meta: makeSingletonResolver('preset', metaAdapter),
  },
  { positional: ['meta'] }
);
