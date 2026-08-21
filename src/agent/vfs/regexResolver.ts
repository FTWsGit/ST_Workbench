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
  { key: 'name', kind: 'text' },
  { key: 'findRegex', kind: 'text' },
  { key: 'replaceString', kind: 'text' },
  { key: 'enabled', kind: 'scalar', valueKind: 'boolean' },
  { key: 'scope', kind: 'enum', enumValues: ['displayOnly', 'promptOnly', 'both'] },
  { key: 'runOnEdit', kind: 'scalar', valueKind: 'boolean' },
  { key: 'substituteRegex', kind: 'enum', enumValues: ['none', 'raw', 'escaped'] },
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

/** scope 数组 → VFS 单值枚举。空数组（两者都不生效）也归为 both。 */
function scopeToEnum(scope: RegexScript['scope']): 'displayOnly' | 'promptOnly' | 'both' {
  const d = scope.includes('displayOnly');
  const p = scope.includes('promptOnly');
  if (d && p) return 'both';
  if (d) return 'displayOnly';
  if (p) return 'promptOnly';
  return 'both';
}

function enumToScope(v: string): RegexScript['scope'] {
  if (v === 'displayOnly') return ['displayOnly'];
  if (v === 'promptOnly') return ['promptOnly'];
  return ['displayOnly', 'promptOnly'];
}

export function makeRegexCollection(
  getHost: (ctx: VfsContext) => RegexHost,
  notLoadedError: string
): CollectionAdapter {
  return {
    name: 'regexs',
    fields: REGEX_FIELDS,
    searchFields: [
      { key: 'name', kind: 'text' },
      { key: 'findRegex', kind: 'text' },
      { key: 'replaceString', kind: 'text' },
    ],
    summaryKeys: ['enabled', 'name'],
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
      return s.name || s.id;
    },
    getField(item, key) {
      const s = item as unknown as RegexScript;
      if (key === 'scope') return scopeToEnum(s.scope);
      if (key === 'minDepth') return s.depth.minDepth;
      if (key === 'maxDepth') return s.depth.maxDepth;
      return (item as Record<string, unknown>)[key];
    },
    setField(item, key, value) {
      const s = item as unknown as RegexScript;
      if (key === 'scope') {
        s.scope = enumToScope(value as string);
        return true;
      }
      if (key === 'minDepth') {
        s.depth.minDepth = value as number | null;
        return true;
      }
      if (key === 'maxDepth') {
        s.depth.maxDepth = value as number | null;
        return true;
      }
      (item as Record<string, unknown>)[key] = value;
      return true;
    },
    createItem(fields, ctx) {
      const host = getHost(ctx);
      const id = host.addRegexScript();
      if (!id) return '';
      const s = host.regexs.find((x) => x.id === id);
      if (s) {
        if (typeof fields.name === 'string') s.name = fields.name;
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
