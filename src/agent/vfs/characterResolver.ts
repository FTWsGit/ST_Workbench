/* character resolver：/character 工作区的资源树。
 *
 *   /character               → collections: fields, greetings, regexs, scripts
 *   /character/fields/{key}  → 虚拟创作字段（description/personality/... 7 个，text）
 *   /character/greetings/{n} → 开场白（positional 数组，下标寻址，无 stable id）
 *   /character/regexs        → 正则脚本（宿主 character）
 *   /character/scripts       → 酒馆脚本（宿主 character）
 *
 * fields 是"字段集"（单例式，7 个 text 叶子），greetings 是 positional 数组——都不是 aliased。
 * 虚拟字段 key 到 Character 顶层/otherPrompts 的映射在 getField/setField 里，跟 characterStore
 * 的 getFieldValue/setFieldValue 同一映射（description 顶层、depthPrompt 在 otherPrompts 里）。
 */
import type { Character } from '../../types';
import type { VfsContext, FieldSpec, FieldWrite } from './types';
import {
  makeAliasedResolver,
  makeSingletonResolver,
  workspaceResolver,
  okResult,
  errResult,
  stringify,
  uniqueSubstringReplace,
} from './collection';
import type { CollectionResolver, SingletonAdapter } from './collection';
import { makeRegexCollection } from './regexResolver';
import { makeScriptCollection } from './scriptResolver';
import { formatVfsPath } from './path';

const NOT_LOADED = '当前没有加载任何角色卡。';

const CHAR_FIELD_KEYS = [
  'description',
  'personality',
  'scenario',
  'mesExample',
  'systemPrompt',
  'postHistoryInstructions',
  'depthPrompt',
] as const;

const CHAR_FIELDS: FieldSpec[] = CHAR_FIELD_KEYS.map((key) => ({ key, kind: 'text' as const }));

function charFieldGet(char: Record<string, unknown>, key: string): unknown {
  const c = char as unknown as Character;
  if (key === 'description') return c.description;
  if (key === 'depthPrompt') return c.otherPrompts.depthPrompt.prompt;
  return (
    c.otherPrompts[
      key as Exclude<(typeof CHAR_FIELD_KEYS)[number], 'description' | 'depthPrompt'>
    ] ?? ''
  );
}

function charFieldSet(char: Record<string, unknown>, key: string, value: unknown): boolean {
  const c = char as unknown as Character;
  const s = String(value);
  if (key === 'description') {
    c.description = s;
    return true;
  }
  if (key === 'depthPrompt') {
    c.otherPrompts.depthPrompt.prompt = s;
    return true;
  }
  if (!CHAR_FIELD_KEYS.includes(key as (typeof CHAR_FIELD_KEYS)[number])) return false;
  c.otherPrompts[key as Exclude<(typeof CHAR_FIELD_KEYS)[number], 'description' | 'depthPrompt'>] =
    s;
  return true;
}

const fieldsAdapter: SingletonAdapter = {
  name: 'fields',
  fields: CHAR_FIELDS,
  notLoadedError: NOT_LOADED,
  get(ctx) {
    const char = ctx.characterStore.character;
    return char ? (char as unknown as Record<string, unknown>) : null;
  },
  getField: charFieldGet,
  setField: charFieldSet,
  markDirty(ctx) {
    ctx.characterStore.markDirty();
  },
};

/* ====== greetings（positional）====== */

function getGreetings(ctx: VfsContext): string[] | null {
  const char = ctx.characterStore.character;
  return char ? char.greetings : null;
}

function resolveGreetingIndex(ctx: VfsContext, segment: string): number | string {
  const greetings = getGreetings(ctx);
  if (!greetings) return NOT_LOADED;
  const idx = Number(segment);
  if (!Number.isInteger(idx) || idx < 0 || idx >= greetings.length) {
    return `invalid greeting index "${segment}" (0..${greetings.length - 1})`;
  }
  return idx;
}

const greetingsResolver: CollectionResolver = {
  list(rest, ctx) {
    const greetings = getGreetings(ctx);
    if (!greetings) return errResult(NOT_LOADED);
    if (rest.length !== 0) {
      return errResult('greeting is a leaf string — use get /character/greetings/{n}');
    }
    const items = greetings.map((g, i) => ({
      alias: String(i),
      name: `greeting ${i + 1}`,
      summary: { len: String(g.length), preview: g.slice(0, 40).replace(/\n/g, ' ') },
    }));
    const text = items
      .map((r) => `${r.alias}  ${r.name}  len=${r.summary.len}  preview=${r.summary.preview}`)
      .join('\n');
    return okResult(text || '(empty)', { type: 'items', items });
  },
  get(rest, ctx) {
    if (rest.length !== 1) return errResult('get needs /character/greetings/{n}');
    const idx = resolveGreetingIndex(ctx, rest[0]);
    if (typeof idx === 'string') return errResult(idx);
    const value = getGreetings(ctx)![idx];
    return okResult(stringify(value), value);
  },
  write(rest, write: FieldWrite, ctx) {
    if (rest.length !== 1) return errResult('edit/set needs /character/greetings/{n}');
    const idx = resolveGreetingIndex(ctx, rest[0]);
    if (typeof idx === 'string') return errResult(idx);
    const greetings = getGreetings(ctx)!;
    const current = greetings[idx];
    const path = formatVfsPath({ workspace: 'character', segments: ['greetings', String(idx)] });
    let value: string;
    if (write.op === 'replace') {
      const r = uniqueSubstringReplace(current, write.old, write.newValue);
      if (!r.ok) return errResult(r.error);
      value = r.value;
    } else {
      value = String(write.value);
    }
    greetings[idx] = value;
    ctx.characterStore.markDirty();
    return okResult(`updated ${path}`, value, [
      { kind: 'set_field', path, before: current, after: value },
    ]);
  },
  create(_rest, _fields, ctx) {
    const char = ctx.characterStore.character;
    if (!char) return errResult(NOT_LOADED);
    char.greetings.push('');
    ctx.characterStore.markDirty();
    return okResult(`added greeting ${char.greetings.length} (index ${char.greetings.length - 1})`);
  },
  remove(rest, ctx) {
    if (rest.length !== 1) return errResult('delete needs /character/greetings/{n}');
    const idx = resolveGreetingIndex(ctx, rest[0]);
    if (typeof idx === 'string') return errResult(idx);
    const char = ctx.characterStore.character!;
    if (char.greetings.length <= 1) {
      return errResult('cannot delete the last greeting (need at least one)');
    }
    const before = char.greetings[idx];
    char.greetings.splice(idx, 1);
    ctx.characterStore.markDirty();
    const path = formatVfsPath({ workspace: 'character', segments: ['greetings', String(idx)] });
    return okResult(`deleted ${path}`, { path }, [{ kind: 'delete', path, before }]);
  },
  search() {
    return errResult('search is not supported on greetings — search /character/fields');
  },
  replace() {
    return errResult('replace is not supported on greetings — search /character/fields');
  },
  modify() {
    return errResult('modify is not supported on greetings — search /character/fields');
  },
};

export const characterResolver = workspaceResolver(
  'character',
  {
    fields: makeSingletonResolver('character', fieldsAdapter),
    greetings: greetingsResolver,
    regexs: makeAliasedResolver(
      'character',
      makeRegexCollection((ctx) => ctx.characterStore, NOT_LOADED)
    ),
    scripts: makeAliasedResolver(
      'character',
      makeScriptCollection((ctx) => ctx.characterStore, NOT_LOADED)
    ),
  },
  { positional: ['fields', 'greetings'] }
);
