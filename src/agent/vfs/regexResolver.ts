/* regex collection adapter：挂在 preset / character 两种宿主上的正则脚本集合。
 *
 * 不是 workspace 级 resolver（decision 0001：regex 不是顶层 workspace，是 preset/character 的
 * sidebarCollection），这里是"同一套 regex 语义、宿主不同"的共享 adapter，被 presetResolver /
 * characterResolver 各自实例化。薄壳复用宿主 store 的 addRegexScript/deleteRegexScript。
 */
import type { RegexScript } from '../../types';
import type { VfsContext, FieldSpec } from './types';
import type { CollectionAdapter } from './collection';

const REGEX_FIELDS: FieldSpec[] = [
  { key: 'scriptName', kind: 'text' },
  { key: 'findRegex', kind: 'text' },
  { key: 'replaceString', kind: 'text' },
  { key: 'enabled', kind: 'scalar', valueKind: 'boolean' },
  { key: 'markdownOnly', kind: 'scalar', valueKind: 'boolean' },
  { key: 'promptOnly', kind: 'scalar', valueKind: 'boolean' },
  { key: 'runOnEdit', kind: 'scalar', valueKind: 'boolean' },
  { key: 'substituteRegex', kind: 'enum', enumValues: ['0', '1', '2'] },
  { key: 'minDepth', kind: 'scalar', valueKind: 'number' },
  { key: 'maxDepth', kind: 'scalar', valueKind: 'number' },
];

export interface RegexHost {
  hasData: boolean;
  regexs: RegexScript[];
  addRegexScript(): string | null;
  deleteRegexScript(id: string): void;
  markDirty(): void;
}

export function makeRegexCollection(
  getHost: (ctx: VfsContext) => RegexHost,
  notLoadedError: string
): CollectionAdapter {
  return {
    name: 'regexs',
    fields: REGEX_FIELDS,
    searchFields: [
      { key: 'scriptName', kind: 'text' },
      { key: 'findRegex', kind: 'text' },
      { key: 'replaceString', kind: 'text' },
    ],
    summaryKeys: ['enabled', 'scriptName'],
    notLoadedError,
    items(ctx) {
      const host = getHost(ctx);
      return host.hasData ? (host.regexs as unknown as Record<string, unknown>[]) : null;
    },
    realIdOf(item) {
      return (item as unknown as RegexScript).id;
    },
    nameOf(item) {
      const s = item as unknown as RegexScript;
      return s.scriptName || s.id;
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
      const id = host.addRegexScript();
      if (!id) return '';
      const s = host.regexs.find((x) => x.id === id);
      if (s) {
        if (typeof fields.scriptName === 'string') s.scriptName = fields.scriptName;
        if (typeof fields.findRegex === 'string') s.findRegex = fields.findRegex;
        if (typeof fields.replaceString === 'string') s.replaceString = fields.replaceString;
      }
      return id;
    },
    removeItem(realId, ctx) {
      const host = getHost(ctx);
      if (!host.regexs.some((s) => s.id === realId)) return false;
      host.deleteRegexScript(realId);
      return true;
    },
    markDirty(ctx) {
      getHost(ctx).markDirty();
    },
  };
}
