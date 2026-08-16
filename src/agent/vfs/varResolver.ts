/* var resolver：变量追踪（LSP 式 refs/defs）。
 *
 * 不重新扫描三域数据——薄壳包 uiStore 上 useVarNav 的现成索引（localRefs/globalRefs），
 * 只做"VarOp.source → VFS path"的转换 + refs/defs 的 kind 过滤。每次查询先 rebuildVarIndex()
 * 保证索引是当前数据的最新快照（agent 写类工具改完内存后、debounced rebuild 可能还没触发）。
 *
 * refs = get/inc/dec/has（读侧引用），defs = set/add（写侧定义）。`certain`（是否会确定注入）
 * 原样透传给模型，避免它误以为所有命中都一定会被激活。
 */
import type { VarOp } from '../../types';
import type { VfsContext } from './types';

const REFS_KINDS = new Set(['get', 'inc', 'dec', 'has']);
const DEFS_KINDS = new Set(['set', 'add']);

export type VarQueryKind = 'refs' | 'defs';

export interface VarHit {
  path: string;
  line: number;
  col: number;
  certain: boolean;
  kind: string;
  scope: 'local' | 'global';
}

function aliasFor(ctx: VfsContext, collectionKey: string, realId: string): string {
  const existing = ctx.aliasTable.aliasOf(collectionKey, realId);
  if (existing !== undefined) return existing;
  return ctx.aliasTable.register(collectionKey, [realId]).get(realId)!;
}

/** VarOp.source → VFS path。character 的 greeting 反解合成 id → 下标（greetingIds.indexOf）。 */
function toPath(op: VarOp, ctx: VfsContext): string | null {
  const s = op.source;
  switch (s.domain) {
    case 'preset':
      return `/preset/prompts/${aliasFor(ctx, 'preset:prompts', s.blockId)}/content`;
    case 'worldbook':
      return `/worldbook/entries/${aliasFor(ctx, 'worldbook:entries', s.blockId)}/content`;
    case 'character': {
      if (s.fieldName === 'greeting') {
        const id = s.blockId.startsWith('field:greeting:')
          ? s.blockId.slice('field:greeting:'.length)
          : s.blockId;
        const idx = ctx.characterStore.greetingIds.indexOf(id);
        return idx < 0 ? null : `/character/greetings/${idx}`;
      }
      return `/character/fields/${s.fieldName ?? 'description'}`;
    }
    default:
      return null;
  }
}

export type VarQueryResult =
  { ok: true; text: string; structured: unknown } | { ok: false; error: string };

export function queryVars(name: string, kind: VarQueryKind, ctx: VfsContext): VarQueryResult {
  const varName = name.trim();
  if (!varName) return { ok: false, error: 'empty variable name' };

  ctx.uiStore.rebuildVarIndex();
  const pool = [...ctx.uiStore.localRefs, ...ctx.uiStore.globalRefs];
  const kinds = kind === 'refs' ? REFS_KINDS : DEFS_KINDS;

  const hits: VarHit[] = [];
  for (const op of pool) {
    if (op.varName !== varName || !kinds.has(op.kind)) continue;
    const path = toPath(op, ctx);
    if (path === null) continue;
    hits.push({
      path,
      line: op.source.line,
      col: op.source.col,
      certain: op.certain,
      kind: op.kind,
      scope: op.scope,
    });
  }

  const verb = kind === 'refs' ? 'referenced by' : 'defined by';
  const lines = hits.map((h) => {
    const loc = h.line >= 0 ? `:${h.line + 1}:${h.col + 1}` : '';
    return `    ${h.path}${loc}  certain=${h.certain}`;
  });
  const text = `{{${varName}}}\n  ${verb}:\n` + (lines.length ? lines.join('\n') : '    (none)');

  return { ok: true, text, structured: { name: varName, kind, hits } };
}
