import type { LocaleKey } from '../i18n';

/* ====== 工具箱 Search 纯函数（LLM 友好的字段化搜索）====== */
/** 一个可搜字段的元数据。labelKey 只负责 UI 显示，searchFields 本身不查 i18n。 */
export interface SearchField {
  /** 字段名（item[field.key] 取值）：'content' / 'findRegex' / 'role' / 'keys' / ... */
  key: string;
  /** i18n key，供 UI 用 uiStore.t() 显示字段名 */
  labelKey: string;
  /** 决定 searchFields() 怎么处理这个字段：
   *  - 'text'：按行 IndexOf 裁窗 ±30 字生成 context
   *  - 'list'：数组逐元素按行搜（SearchHit.line = 元素下标）
   *  - 'enum'：`String(item[field]) === query` 整值匹配（line/col 恒为 -1） */
  kind: 'text' | 'list' | 'enum';
}

/** 一条命中。itemId 能唯一定位到具体哪条 item（preset block identifier / worldbook uid / regex script id /
 *  character 虚拟字段 key 'field:xxx'），itemName 是显示名。 */
export interface SearchHit {
  itemId: string;
  itemName: string;
  fieldKey: string;
  /** text/list 用：第几行（0-based）；enum 恒为 -1 */
  line: number;
  /** text/list 用：列；enum 恒为 -1 */
  col: number;
  /** 命中上下文：命中位置 ±30 字 + '…' */
  context: string;
  /** match start in context */
  ms: number;
  /** match length */
  ml: number;
}

/** item 到 {id,name} 的 getter，由调用方（searchFields.ts adapter）按各域取法填。
 *  item 的元数据字段：id/identifier/name/scriptName/comment/key 按字符串读，labelKey 是
 *  i18n 键（LocaleKey），其余字段走 unknown 索引透传。 */
type SearchItem = {
  id: string;
  identifier: string;
  name: string;
  scriptName: string;
  comment: string;
  key: string;
  labelKey: LocaleKey;
  [k: string]: unknown;
};
export type SearchItemMeta = (item: SearchItem) => { id: string; name: string };

const SEARCH_WINDOW = 30;

function defaultGetItemMeta(item: Record<string, unknown>): { id: string; name: string } {
  const id = item?.identifier ?? item?.uid ?? item?.id ?? item?.key ?? '';
  const name = item?.name ?? item?.scriptName ?? item?.comment ?? item?.key ?? String(id);
  return { id: String(id), name: String(name) };
}

/** 命中位置 ±30 字的裁窗上下文。 */
function searchWindow(line: string, start: number, len: number): { context: string; ms: number } {
  const cs = Math.max(0, start - SEARCH_WINDOW),
    ce = Math.min(line.length, start + len + SEARCH_WINDOW);
  return {
    context: (cs > 0 ? '…' : '') + line.substring(cs, ce) + (ce < line.length ? '…' : ''),
    ms: start - cs + (cs > 0 ? 1 : 0),
  };
}

/** 在单个文本串上做大小写不敏感的逐行子串搜索，回调每个命中位置。 */
function searchTextLine(
  text: string,
  ql: string,
  onHit: (col: number, context: string, ms: number, ml: number) => void
) {
  const ll = text.toLowerCase();
  let si = 0;
  while (true) {
    const f = ll.indexOf(ql, si);
    if (f === -1) break;
    const w = searchWindow(text, f, ql.length);
    onHit(f, w.context, w.ms, ql.length);
    si = f + 1;
  }
}

/**
 * 在 items 上按 fields 搜 query，返回纯 hits 数组。
 * - kind='text'：item[field] 拆行按行 IndexOf（小写比较），裁窗 ±30 + '…'
 * - kind='list'：item[field] 是数组，逐元素按行搜（line=元素下标，col=元素内位置）
 * - kind='enum'：String(item[field]) === query 整值匹配（line=-1, col=-1）
 * 不碰 Vue 响应式——调方传 shallow items[]，返回纯 hits 数组；不查 i18n，labelKey 由 UI 自己翻。
 */
export function searchFields(
  items: Record<string, unknown>[],
  fields: SearchField[],
  query: string,
  getItemMeta?: SearchItemMeta
): SearchHit[] {
  if (!query) return [];
  const ql = query.toLowerCase();
  const getMeta = getItemMeta || defaultGetItemMeta;
  const hits: SearchHit[] = [];
  for (const item of items) {
    if (item == null) continue;
    const meta = getMeta(item as SearchItem);
    for (const f of fields) {
      const raw = item[f.key];
      if (raw === undefined || raw === null) continue;
      if (f.kind === 'enum') {
        const s = String(raw);
        if (s !== query) continue;
        const w = searchWindow(s, 0, s.length);
        hits.push({
          itemId: meta.id,
          itemName: meta.name,
          fieldKey: f.key,
          line: -1,
          col: -1,
          context: w.context,
          ms: w.ms,
          ml: s.length,
        });
        continue;
      }
      if (f.kind === 'list') {
        if (!Array.isArray(raw)) continue;
        raw.forEach((el, idx) => {
          searchTextLine(String(el ?? ''), ql, (col, context, ms, ml) => {
            hits.push({
              itemId: meta.id,
              itemName: meta.name,
              fieldKey: f.key,
              line: idx,
              col,
              context,
              ms,
              ml,
            });
          });
        });
        continue;
      }
      // kind='text'
      if (typeof raw !== 'string') continue;
      raw.split('\n').forEach((line, li) => {
        searchTextLine(line, ql, (col, context, ms, ml) => {
          hits.push({
            itemId: meta.id,
            itemName: meta.name,
            fieldKey: f.key,
            line: li,
            col,
            context,
            ms,
            ml,
          });
        });
      });
    }
  }
  return hits;
}
