/* tavern_helper script collection adapter：挂在 preset / character 两种宿主上的酒馆脚本集合。
 *
 * 同 regexResolver.ts：不是 workspace 级 resolver，是共享 collection adapter，薄壳复用宿主的
 * addScriptTree/deleteScriptTree。不把内部 `th_` 前缀 id 暴露给 agent（agent 只看 alias）。
 */
import type { Script } from '../../types';
import type { VfsContext, FieldSpec } from './types';
import type { CollectionAdapter } from './collection';

const SCRIPT_FIELDS: FieldSpec[] = [
  { key: 'name', kind: 'text' },
  { key: 'content', kind: 'text' },
  { key: 'info', kind: 'text' },
  { key: 'enabled', kind: 'scalar', valueKind: 'boolean' },
];

export interface ScriptHost {
  hasData: boolean;
  scripts: Script[];
  addScriptTree(): string | null;
  deleteScriptTree(id: string): void;
  markDirty(): void;
}

export function makeScriptCollection(
  getHost: (ctx: VfsContext) => ScriptHost,
  notLoadedError: string
): CollectionAdapter {
  return {
    name: 'scripts',
    fields: SCRIPT_FIELDS,
    searchFields: [
      { key: 'name', kind: 'text' },
      { key: 'content', kind: 'text' },
      { key: 'info', kind: 'text' },
    ],
    summaryKeys: ['enabled', 'name'],
    notLoadedError,
    items(ctx) {
      const host = getHost(ctx);
      return host.hasData ? (host.scripts as unknown as Record<string, unknown>[]) : null;
    },
    realIdOf(item) {
      return (item as unknown as Script).id;
    },
    nameOf(item) {
      const s = item as unknown as Script;
      return s.name || s.id;
    },
    getField(item, key) {
      return (item as Record<string, unknown>)[key];
    },
    setField(item, key, value) {
      (item as Record<string, unknown>)[key] = value;
      return true;
    },
    createItem(fields, ctx) {
      const host = getHost(ctx);
      const id = host.addScriptTree();
      if (!id) return '';
      const s = host.scripts.find((x) => x.id === id);
      if (s) {
        if (typeof fields.name === 'string') s.name = fields.name;
        if (typeof fields.content === 'string') s.content = fields.content;
      }
      return id;
    },
    removeItem(realId, ctx) {
      const host = getHost(ctx);
      if (!host.scripts.some((s) => s.id === realId)) return false;
      host.deleteScriptTree(realId);
      return true;
    },
    markDirty(ctx) {
      getHost(ctx).markDirty();
    },
  };
}
