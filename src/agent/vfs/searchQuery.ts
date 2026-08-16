/* VFS search query 语法 + 匹配核心。纯函数，不碰 Vue 响应式。
 *
 * 三个态（invest §6.1）：
 *   foo            → text（子串，大小写不敏感）
 *   /foo/gi        → regex（/source/flags）
 *   role=user      → field 精确匹配（op '=' / '!='，值做轻量 boolean/number 推断）
 *
 * 与 lib/search.ts 的 searchFields 分离：那个是工具箱（人类 UI）专用、只支持子串、本次不动
 * （invest §1 明确"不涉及 components/toolbox"）。这里 searchItems 是 VFS 的 SearchQuery 匹配核心，
 * search/replace/modify/dry-run 全部共享这一份，避免"dry-run 说改 5 处、真跑改 6 处"的两份逻辑漂移。
 *
 * ReDoS 防护（invest §6.2）：源串长度上限 + flags 严格校验 + 匹配循环迭代上限。残余风险——
 * 单个 match 的灾难性回溯时间无法用这些上限根治（同步 JS 无法 abort），只能靠源串长度上限压缩
 * 正则复杂度，接受这个已知边界。
 */
import { REGEX_SOURCE_MAX_LENGTH, SEARCH_MATCHES_MAX } from '../constants';
import { getPath } from './objectPath';

export type SearchQuery =
  | { kind: 'text'; value: string }
  | { kind: 'regex'; source: string; flags: string }
  | { kind: 'field'; field: string; op: '=' | '!='; value: unknown };

/** 可搜字段：kind 复用 lib/search.ts 的三态语义（text=按行子串、list=逐元素、enum=整值）。 */
export interface SearchableField {
  key: string;
  kind: 'text' | 'list' | 'enum';
}

/** 一条命中（不含 path——path 依赖 session 的 alias 表，由 resolver 在拿到真实 id 后补）。 */
export interface SearchMatch {
  /** 真实 id（内部 identity，不出现在给模型的 text 里）。 */
  itemId: string;
  itemName: string;
  fieldKey: string;
  /** 0-based；enum/field 精确匹配恒 -1。 */
  line: number;
  col: number;
  /** 命中位置 ±30 字裁窗上下文。 */
  context: string;
}

const SEARCH_WINDOW = 30;
const ALLOWED_FLAGS = /^[gimsuy]*$/;

function defaultMeta(item: Record<string, unknown>): { id: string; name: string } {
  const id = item?.identifier ?? item?.uid ?? item?.id ?? item?.key ?? '';
  const name = item?.name ?? item?.scriptName ?? item?.comment ?? item?.key ?? String(id);
  return { id: String(id), name: String(name) };
}

/** field query 的 value 做轻量类型推断：true/false → boolean，纯数字 → number，否则原串。 */
function coerceFieldValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export function parseSearchQuery(input: string): SearchQuery {
  const s = typeof input === 'string' ? input.trim() : '';
  // regex：/source/flags
  if (s.startsWith('/')) {
    const lastSlash = s.lastIndexOf('/');
    if (lastSlash > 0) {
      return {
        kind: 'regex',
        source: s.slice(1, lastSlash),
        flags: s.slice(lastSlash + 1),
      };
    }
  }
  // field：key=value / key!=value（key 非空）
  const eq = s.indexOf('=');
  if (eq > 0) {
    if (s[eq - 1] === '!') {
      return {
        kind: 'field',
        field: s.slice(0, eq - 1).trim(),
        op: '!=',
        value: coerceFieldValue(s.slice(eq + 1).trim()),
      };
    }
    return {
      kind: 'field',
      field: s.slice(0, eq).trim(),
      op: '=',
      value: coerceFieldValue(s.slice(eq + 1).trim()),
    };
  }
  return { kind: 'text', value: s };
}

/** 校验 query（regex 源串长度 + flags + 语法）。返回错误文案或 null。 */
export function validateSearchQuery(query: SearchQuery): string | null {
  if (query.kind !== 'regex') return null;
  if (!ALLOWED_FLAGS.test(query.flags)) {
    return `invalid regex flags "${query.flags}" (allowed: g i m s u y)`;
  }
  if (query.source.length > REGEX_SOURCE_MAX_LENGTH) {
    return `regex too long (${query.source.length} > ${REGEX_SOURCE_MAX_LENGTH} chars)`;
  }
  try {
    new RegExp(query.source);
    return null;
  } catch (e) {
    return `invalid regex: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** 命中位置 ±30 字裁窗。 */
function windowContext(line: string, start: number, len: number): string {
  const cs = Math.max(0, start - SEARCH_WINDOW);
  const ce = Math.min(line.length, start + len + SEARCH_WINDOW);
  return (cs > 0 ? '…' : '') + line.slice(cs, ce) + (ce < line.length ? '…' : '');
}

/** 在一段多行文本上做 text/regex 匹配，逐行回传 (line, col, context)。 */
function matchInText(
  text: string,
  query: Extract<SearchQuery, { kind: 'text' | 'regex' }>,
  onHit: (line: number, col: number, context: string) => void
) {
  const lines = text.split('\n');
  if (query.kind === 'text') {
    const ql = query.value.toLowerCase();
    if (!ql) return;
    lines.forEach((line, li) => {
      const ll = line.toLowerCase();
      let si = 0;
      while (si < line.length) {
        const f = ll.indexOf(ql, si);
        if (f === -1) break;
        onHit(li, f, windowContext(line, f, ql.length));
        si = f + 1;
      }
    });
    return;
  }
  // regex
  const flags = query.flags.includes('g') ? query.flags : query.flags + 'g';
  const re = new RegExp(query.source, flags);
  lines.forEach((line, li) => {
    let count = 0;
    for (const m of line.matchAll(re)) {
      if (++count > SEARCH_MATCHES_MAX) break; // 单行迭代上限（配合全局上限，防失控）
      const idx = m.index ?? 0;
      onHit(li, idx, windowContext(line, idx, m[0].length));
    }
  });
}

/**
 * 在 items 上按 fields + query 做匹配，返回纯 hits 数组。不碰 Vue 响应式，不查 i18n。
 * - text/regex query：扫 kind='text'（多行逐行）与 kind='list'（逐元素）字段。
 * - field query：对名为 query.field 的字段做整值精确匹配（op '=' / '!='），line/col 恒 -1。
 * 命中数达到 SEARCH_MATCHES_MAX 即截断。
 */
export function searchItems(
  items: Record<string, unknown>[],
  fields: SearchableField[],
  query: SearchQuery,
  getItemMeta?: (item: Record<string, unknown>) => { id: string; name: string }
): SearchMatch[] {
  const meta = getItemMeta ?? defaultMeta;
  const matches: SearchMatch[] = [];

  for (const item of items) {
    if (item == null) continue;
    if (matches.length >= SEARCH_MATCHES_MAX) break;
    const { id, name } = meta(item);

    if (query.kind === 'field') {
      const f = fields.find((x) => x.key === query.field);
      if (!f) continue;
      const raw = getPath(item, query.field);
      if (raw === undefined || raw === null) continue;
      const eq = String(raw) === String(query.value);
      if (query.op === '=' ? eq : !eq) {
        matches.push({
          itemId: id,
          itemName: name,
          fieldKey: query.field,
          line: -1,
          col: -1,
          context: String(raw).slice(0, 80),
        });
      }
      continue;
    }

    for (const f of fields) {
      if (f.kind === 'enum') continue;
      if (matches.length >= SEARCH_MATCHES_MAX) break;
      const raw = getPath(item, f.key);
      if (raw === undefined || raw === null) continue;
      if (f.kind === 'list') {
        if (!Array.isArray(raw)) continue;
        raw.forEach((el, idx) => {
          if (matches.length >= SEARCH_MATCHES_MAX) return;
          matchInText(String(el ?? ''), query, (line, col, context) => {
            matches.push({ itemId: id, itemName: name, fieldKey: f.key, line: idx, col, context });
          });
        });
      } else {
        if (typeof raw !== 'string') continue;
        matchInText(raw, query, (line, col, context) => {
          matches.push({ itemId: id, itemName: name, fieldKey: f.key, line, col, context });
        });
      }
    }
  }
  return matches;
}
