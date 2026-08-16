/* VFS collection resolver 机制：aliased 集合 + singleton 的可替换接入点 + 分派。
 *
 * 这是"路由层"的落地（invest §4）：把"路径怎么解析成资源、alias/name 怎么寻址、FieldSpec 怎么
 * 校验、text/scalar 怎么写"这套行为契约抽出来，各 domain 只填 adapter（怎么拿 items、怎么读写字
 * 段、怎么 create/remove）。不做 BaseApi<T>（decision 0004），adapter 只描述行为、不统一数据形状。
 */
import type { Workspace } from '../../types';
import type {
  VfsContext,
  VfsResult,
  VfsResolver,
  FieldSpec,
  FieldWrite,
  ChangeOperation,
  ListItemRow,
  ListFieldRow,
} from './types';
import type { SearchableField, SearchQuery } from './searchQuery';
import { searchItems } from './searchQuery';
import { formatVfsPath } from './path';

/* ====== aliased 集合 adapter ====== */

export interface CollectionAdapter {
  name: string;
  fields: FieldSpec[];
  searchFields: SearchableField[];
  /** list(item) 摘要展示哪些字段。 */
  summaryKeys: string[];
  notLoadedError: string;
  items(ctx: VfsContext): Record<string, unknown>[] | null;
  realIdOf(item: Record<string, unknown>): string;
  nameOf(item: Record<string, unknown>): string;
  getField(item: Record<string, unknown>, key: string): unknown;
  setField(item: Record<string, unknown>, key: string, value: unknown): boolean;
  createItem(fields: Record<string, unknown>, ctx: VfsContext): string;
  removeItem(realId: string, ctx: VfsContext): boolean;
  markDirty(ctx: VfsContext): void;
}

/* ====== singleton adapter（如 /preset/meta，单例文档，无 item）====== */

export interface SingletonAdapter {
  name: string;
  fields: FieldSpec[];
  notLoadedError: string;
  get(ctx: VfsContext): Record<string, unknown> | null;
  /** 读字段值，默认 obj[key]。字段不在对象顶层时（如 character 的 depthPrompt 在 otherPrompts 里）覆写。 */
  getField?(obj: Record<string, unknown>, key: string): unknown;
  /** 写字段值，默认 obj[key]=value。覆写以支持非顶层映射。 */
  setField?(obj: Record<string, unknown>, key: string, value: unknown): boolean;
  markDirty(ctx: VfsContext): void;
}

/* ====== 内部工具 ====== */

type RefResult =
  | { ok: true; item: Record<string, unknown>; realId: string; alias: string }
  | { ok: false; error: string };

export function okResult(
  text: string,
  structured?: unknown,
  changes?: ChangeOperation[]
): VfsResult {
  return { ok: true, text, structured, changes };
}

export function errResult(error: string): VfsResult {
  return { ok: false, error };
}

function collectionKey(workspace: Workspace, name: string): string {
  return `${workspace}:${name}`;
}

export function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `[${v.map((x) => String(x)).join(',')}]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fieldRow(spec: FieldSpec): ListFieldRow {
  return {
    key: spec.key,
    kind: spec.kind,
    enumValues: spec.enumValues,
    valueKind: spec.valueKind,
    readonly: spec.readonly,
  };
}

/** 把 segment 解析成 item：数字=alias（查表），否则=name（现场精确匹配，不缓存）。 */
function resolveRef(
  adapter: CollectionAdapter,
  workspace: Workspace,
  segment: string,
  ctx: VfsContext
): RefResult {
  const items = adapter.items(ctx);
  if (!items) return { ok: false, error: adapter.notLoadedError };
  const key = collectionKey(workspace, adapter.name);

  if (/^\d+$/.test(segment)) {
    const realId = ctx.aliasTable.resolve(key, segment);
    if (realId === undefined) {
      return {
        ok: false,
        error: `unknown alias "${segment}" in /${workspace}/${adapter.name} — call list first`,
      };
    }
    const item = items.find((i) => adapter.realIdOf(i) === realId);
    if (!item) return { ok: false, error: `alias "${segment}" no longer exists` };
    return { ok: true, item, realId, alias: segment };
  }

  const matches = items.filter((i) => adapter.nameOf(i) === segment);
  if (matches.length === 0) {
    return {
      ok: false,
      error: `no item named "${segment}" in /${workspace}/${adapter.name} — call list to refresh`,
    };
  }
  if (matches.length > 1) {
    const lines = matches.map((i) => {
      const rid = adapter.realIdOf(i);
      const alias =
        ctx.aliasTable.aliasOf(key, rid) ?? ctx.aliasTable.register(key, [rid]).get(rid)!;
      return `  ${alias}  ${adapter.nameOf(i)}`;
    });
    return {
      ok: false,
      error: `name "${segment}" is ambiguous, pick an alias:\n${lines.join('\n')}`,
    };
  }
  const item = matches[0];
  const realId = adapter.realIdOf(item);
  const alias =
    ctx.aliasTable.aliasOf(key, realId) ?? ctx.aliasTable.register(key, [realId]).get(realId)!;
  return { ok: true, item, realId, alias };
}

/** 唯一子串替换：old 必须恰好出现 1 次，否则报错（0 次/2+ 次都算错）。 */
export function uniqueSubstringReplace(
  current: string,
  old: string,
  newValue: string
): { ok: true; value: string } | { ok: false; error: string } {
  if (old === '') return { ok: false, error: 'old substring must be non-empty' };
  const first = current.indexOf(old);
  if (first === -1) {
    return { ok: false, error: 'old substring not found in current value (0 matches)' };
  }
  const second = current.indexOf(old, first + old.length);
  if (second !== -1) {
    return { ok: false, error: 'old substring matches 2+ places — make it more specific' };
  }
  return {
    ok: true,
    value: current.slice(0, first) + newValue + current.slice(first + old.length),
  };
}

/** 校验 FieldWrite 与 FieldSpec 是否匹配，返回错误或 null。 */
function checkWrite(spec: FieldSpec, write: FieldWrite): string | null {
  if (write.op === 'replace') {
    if (spec.kind !== 'text') {
      return `field "${spec.key}" is ${spec.kind}, not text — use set(path, value) instead of edit`;
    }
    return null;
  }
  if (spec.kind === 'text') {
    return `field "${spec.key}" is text — use edit(path, old, new) instead of set`;
  }
  if (spec.kind === 'enum' && spec.enumValues && !spec.enumValues.includes(String(write.value))) {
    return `invalid value for enum "${spec.key}" (allowed: ${spec.enumValues.join(', ')})`;
  }
  if (spec.kind === 'scalar' && spec.valueKind === 'boolean' && typeof write.value !== 'boolean') {
    return `field "${spec.key}" expects a boolean, got ${typeof write.value}`;
  }
  if (spec.kind === 'scalar' && spec.valueKind === 'number' && typeof write.value !== 'number') {
    return `field "${spec.key}" expects a number, got ${typeof write.value}`;
  }
  return null;
}

/** 对叶子字段执行写入（edit/set），产出 changes。 */
function applyFieldWrite(
  spec: FieldSpec,
  current: unknown,
  write: FieldWrite,
  path: string
): { value: unknown; change: ChangeOperation } | { error: string } {
  if (write.op === 'replace') {
    const r = uniqueSubstringReplace(String(current ?? ''), write.old, write.newValue);
    if (!r.ok) return { error: r.error };
    return { value: r.value, change: { kind: 'set_field', path, before: current, after: r.value } };
  }
  return {
    value: write.value,
    change: { kind: 'set_field', path, before: current, after: write.value },
  };
}

function snapshotFields(
  adapter: CollectionAdapter,
  item: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of adapter.fields) out[f.key] = adapter.getField(item, f.key);
  return out;
}

/* ====== aliased 集合 resolver ====== */

export function makeAliasedResolver(workspace: Workspace, adapter: CollectionAdapter) {
  const key = collectionKey(workspace, adapter.name);

  function list(rest: string[], ctx: VfsContext): VfsResult {
    if (rest.length === 0) {
      const items = adapter.items(ctx);
      if (!items) return errResult(adapter.notLoadedError);
      const aliasMap = ctx.aliasTable.register(
        key,
        items.map((i) => adapter.realIdOf(i))
      );
      const rows: ListItemRow[] = items.map((i) => {
        const alias = aliasMap.get(adapter.realIdOf(i))!;
        const summary: Record<string, string> = {};
        for (const sk of adapter.summaryKeys) summary[sk] = stringify(adapter.getField(i, sk));
        return { alias, name: adapter.nameOf(i), summary };
      });
      const text = rows
        .map((r) => {
          const kv = Object.entries(r.summary)
            .map(([k, v]) => `${k}=${v}`)
            .join('  ');
          return `${r.alias}  ${r.name}${kv ? '  ' + kv : ''}`;
        })
        .join('\n');
      return okResult(text || '(empty)', { type: 'items', items: rows });
    }
    if (rest.length === 1) {
      const ref = resolveRef(adapter, workspace, rest[0], ctx);
      if (!ref.ok) return errResult(ref.error);
      const fields = adapter.fields.map(fieldRow);
      const text = fields
        .map(
          (f) =>
            `${f.key} (${f.kind}${
              f.enumValues ? ': ' + f.enumValues.join('|') : ''
            }${f.readonly ? ', readonly' : ''})`
        )
        .join('\n');
      return okResult(text || '(no fields)', { type: 'fields', fields });
    }
    return errResult(
      `cannot list beyond a field — use get for a leaf (e.g. /${workspace}/${adapter.name}/{alias}/{field})`
    );
  }

  function get(rest: string[], ctx: VfsContext): VfsResult {
    if (rest.length !== 2) {
      return errResult(
        `get needs a leaf path /${workspace}/${adapter.name}/{alias}/{field} — use list to explore`
      );
    }
    const ref = resolveRef(adapter, workspace, rest[0], ctx);
    if (!ref.ok) return errResult(ref.error);
    const spec = adapter.fields.find((f) => f.key === rest[1]);
    if (!spec) {
      return errResult(
        `unknown field "${rest[1]}" in /${workspace}/${adapter.name} — list /${workspace}/${adapter.name}/${ref.alias} to see fields`
      );
    }
    const value = adapter.getField(ref.item, spec.key);
    return okResult(stringify(value), value);
  }

  function write(rest: string[], writeOp: FieldWrite, ctx: VfsContext): VfsResult {
    if (rest.length !== 2) {
      return errResult(`edit/set needs a leaf path /${workspace}/${adapter.name}/{alias}/{field}`);
    }
    const ref = resolveRef(adapter, workspace, rest[0], ctx);
    if (!ref.ok) return errResult(ref.error);
    const spec = adapter.fields.find((f) => f.key === rest[1]);
    if (!spec) {
      return errResult(
        `field "${rest[1]}" is not declared in /${workspace}/${adapter.name} — rejected (not writable)`
      );
    }
    if (spec.readonly) return errResult(`field "${spec.key}" is read-only`);
    const err = checkWrite(spec, writeOp);
    if (err) return errResult(err);
    const current = adapter.getField(ref.item, spec.key);
    const path = formatVfsPath({ workspace, segments: [adapter.name, ref.alias, spec.key] });
    const applied = applyFieldWrite(spec, current, writeOp, path);
    if ('error' in applied) return errResult(applied.error);
    adapter.setField(ref.item, spec.key, applied.value);
    adapter.markDirty(ctx);
    return okResult(`updated ${path}`, applied.value, [applied.change]);
  }

  function create(rest: string[], fields: Record<string, unknown>, ctx: VfsContext): VfsResult {
    if (rest.length !== 0) {
      return errResult(`create applies to a collection root /${workspace}/${adapter.name}`);
    }
    const items = adapter.items(ctx);
    if (!items) return errResult(adapter.notLoadedError);
    // 先登记所有现有 item（确保 counter 反映现状），新 item 才拿下一个 alias——否则 create 在
    // 未 list 过时会把新 item 记成 alias 1，跟现有第一条撞号。
    ctx.aliasTable.register(
      key,
      items.map((i) => adapter.realIdOf(i))
    );
    const realId = adapter.createItem(fields, ctx);
    const alias = ctx.aliasTable.register(key, [realId]).get(realId)!;
    const path = formatVfsPath({ workspace, segments: [adapter.name, alias] });
    return okResult(`created ${path} (alias ${alias})`, { path, alias }, [
      { kind: 'create', path, after: fields },
    ]);
  }

  function remove(rest: string[], ctx: VfsContext): VfsResult {
    if (rest.length !== 1) {
      return errResult(`delete needs /${workspace}/${adapter.name}/{alias}`);
    }
    const ref = resolveRef(adapter, workspace, rest[0], ctx);
    if (!ref.ok) return errResult(ref.error);
    const before = snapshotFields(adapter, ref.item);
    const removed = adapter.removeItem(ref.realId, ctx);
    if (!removed) return errResult(`failed to delete ${ref.alias}`);
    ctx.aliasTable.retire(key, ref.realId);
    const path = formatVfsPath({ workspace, segments: [adapter.name, ref.alias] });
    return okResult(`deleted ${path}`, { path, alias: ref.alias }, [
      { kind: 'delete', path, before },
    ]);
  }

  function search(rest: string[], query: SearchQuery, ctx: VfsContext): VfsResult {
    if (rest.length !== 0) {
      return errResult(`search applies to a collection root /${workspace}/${adapter.name}`);
    }
    const items = adapter.items(ctx);
    if (!items) return errResult(adapter.notLoadedError);
    const aliasMap = ctx.aliasTable.register(
      key,
      items.map((i) => adapter.realIdOf(i))
    );
    const matches = searchItems(items, adapter.searchFields, query, (item) => ({
      id: adapter.realIdOf(item),
      name: adapter.nameOf(item),
    }));
    const rows = matches.map((m) => {
      const alias = aliasMap.get(m.itemId) ?? '?';
      const path = formatVfsPath({ workspace, segments: [adapter.name, alias, m.fieldKey] });
      return {
        path,
        line: m.line,
        col: m.col,
        context: m.context,
        itemId: m.itemId,
        itemName: m.itemName,
        fieldKey: m.fieldKey,
      };
    });
    const text = rows
      .map((r) => `${r.path}${r.line >= 0 ? `:${r.line + 1}:${r.col + 1}` : ''}  ${r.context}`)
      .join('\n');
    return okResult(text || 'no hits', { type: 'hits', hits: rows });
  }

  return { list, get, write, create, remove, search };
}

/* ====== singleton resolver ====== */

export function makeSingletonResolver(workspace: Workspace, adapter: SingletonAdapter) {
  function list(rest: string[], ctx: VfsContext): VfsResult {
    if (rest.length !== 0) {
      return errResult(
        `/${workspace}/${adapter.name} is a single document — list its fields, then get a field`
      );
    }
    if (!adapter.get(ctx)) return errResult(adapter.notLoadedError);
    const fields = adapter.fields.map(fieldRow);
    const text = fields
      .map(
        (f) =>
          `${f.key} (${f.kind}${
            f.enumValues ? ': ' + f.enumValues.join('|') : ''
          }${f.readonly ? ', readonly' : ''})`
      )
      .join('\n');
    return okResult(text || '(no fields)', { type: 'fields', fields });
  }

  function get(rest: string[], ctx: VfsContext): VfsResult {
    if (rest.length !== 1) {
      return errResult(`get needs /${workspace}/${adapter.name}/{field} — use list to see fields`);
    }
    const obj = adapter.get(ctx);
    if (!obj) return errResult(adapter.notLoadedError);
    const spec = adapter.fields.find((f) => f.key === rest[0]);
    if (!spec) return errResult(`unknown field "${rest[0]}" in /${workspace}/${adapter.name}`);
    const value = adapter.getField ? adapter.getField(obj, spec.key) : obj[spec.key];
    return okResult(stringify(value), value);
  }

  function write(rest: string[], writeOp: FieldWrite, ctx: VfsContext): VfsResult {
    if (rest.length !== 1) {
      return errResult(`set needs /${workspace}/${adapter.name}/{field}`);
    }
    const obj = adapter.get(ctx);
    if (!obj) return errResult(adapter.notLoadedError);
    const spec = adapter.fields.find((f) => f.key === rest[0]);
    if (!spec) {
      return errResult(
        `field "${rest[0]}" is not declared in /${workspace}/${adapter.name} — rejected`
      );
    }
    if (spec.readonly) return errResult(`field "${spec.key}" is read-only`);
    const err = checkWrite(spec, writeOp);
    if (err) return errResult(err);
    const current = adapter.getField ? adapter.getField(obj, spec.key) : obj[spec.key];
    const path = formatVfsPath({ workspace, segments: [adapter.name, spec.key] });
    const applied = applyFieldWrite(spec, current, writeOp, path);
    if ('error' in applied) return errResult(applied.error);
    const written = adapter.setField
      ? adapter.setField(obj, spec.key, applied.value)
      : ((obj[spec.key] = applied.value), true);
    if (!written) return errResult(`failed to write field "${spec.key}"`);
    adapter.markDirty(ctx);
    return okResult(`updated ${path}`, applied.value, [applied.change]);
  }

  function create(): VfsResult {
    return errResult(`/${workspace}/${adapter.name} is a single document — cannot create`);
  }
  function remove(): VfsResult {
    return errResult(`/${workspace}/${adapter.name} is a single document — cannot delete`);
  }
  function search(): VfsResult {
    return errResult(
      `search is not supported on /${workspace}/${adapter.name} — search a collection`
    );
  }

  return { list, get, write, create, remove, search };
}

/* ====== workspace 分派 ====== */

/** 一个 collection resolver 的通用形状（aliased 与 singleton 都满足）。 */
export interface CollectionResolver {
  list(rest: string[], ctx: VfsContext): VfsResult;
  get(rest: string[], ctx: VfsContext): VfsResult;
  write(rest: string[], write: FieldWrite, ctx: VfsContext): VfsResult;
  create(rest: string[], fields: Record<string, unknown>, ctx: VfsContext): VfsResult;
  remove(rest: string[], ctx: VfsContext): VfsResult;
  search(rest: string[], query: SearchQuery, ctx: VfsContext): VfsResult;
}

/** 把一个 workspace 的 collection 表包成一个 VfsResolver：按 segments[0] 分派到 collection。 */
export function workspaceResolver(
  workspace: Workspace,
  collections: Record<string, CollectionResolver>,
  options: { positional?: string[] } = {}
): VfsResolver {
  const names = Object.keys(collections);
  const positional = new Set(options.positional ?? []);

  function idKindOf(name: string): 'aliased' | 'positional' {
    return positional.has(name) ? 'positional' : 'aliased';
  }

  function list(segments: string[], ctx: VfsContext): VfsResult {
    if (segments.length === 0) {
      const rows = names.map((n) => ({ name: n, idKind: idKindOf(n) }));
      return okResult(rows.map((r) => r.name).join('\n') || '(empty)', {
        type: 'collections',
        collections: rows,
      });
    }
    const name = segments[0];
    const c = collections[name];
    if (!c) {
      return errResult(
        `unknown collection "${name}" in /${workspace} — list /${workspace} to see collections`
      );
    }
    return c.list(segments.slice(1), ctx);
  }

  function get(segments: string[], ctx: VfsContext): VfsResult {
    const name = segments[0];
    const c = name ? collections[name] : undefined;
    if (!c) return errResult(`get needs a collection path under /${workspace} — use list first`);
    return c.get(segments.slice(1), ctx);
  }

  function write(segments: string[], write: FieldWrite, ctx: VfsContext): VfsResult {
    const name = segments[0];
    const c = name ? collections[name] : undefined;
    if (!c) return errResult(`edit/set needs a collection path under /${workspace}`);
    return c.write(segments.slice(1), write, ctx);
  }

  function create(segments: string[], fields: Record<string, unknown>, ctx: VfsContext): VfsResult {
    const name = segments[0];
    const c = name ? collections[name] : undefined;
    if (!c) return errResult(`create needs a collection path under /${workspace}`);
    return c.create(segments.slice(1), fields, ctx);
  }

  function remove(segments: string[], ctx: VfsContext): VfsResult {
    const name = segments[0];
    const c = name ? collections[name] : undefined;
    if (!c) return errResult(`delete needs a collection path under /${workspace}`);
    return c.remove(segments.slice(1), ctx);
  }

  function search(segments: string[], query: SearchQuery, ctx: VfsContext): VfsResult {
    const name = segments[0];
    const c = name ? collections[name] : undefined;
    if (!c) return errResult(`search needs a collection path under /${workspace}`);
    return c.search(segments.slice(1), query, ctx);
  }

  return { workspace, list, get, write, create, remove, search };
}
