import type { MacroAnalysis } from './macroSpans';
import { findMacroEnd } from './macroText';

/**
 * 把 `text` 按 top-level `{{...}}` macro 切成字面片段（macro 自身移除），保留顺序。
 * n 个 macro → n+1 个片段，任一片段可为空字符串。macroAwareDiff 用它锚定字面文本。
 */
function splitByMacros(text: string): string[] {
  const pieces: string[] = [];
  let out = '',
    i = 0;
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i);
      if (end !== -1) {
        pieces.push(out);
        out = '';
        i = end;
        continue;
      }
    }
    out += text[i];
    i++;
  }
  pieces.push(out);
  return pieces;
}

function pushRun(out: { text: string; added: boolean }[], text: string, added: boolean) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.added === added) last.text += text;
  else out.push({ text, added });
}

/**
 * macro 边界锚定的 diff：`raw` 含 macro，`rendered` 是 ST 真实渲染文本。
 * 把 raw 按宏跨度拆成字面片段；因 ST 原位替换 macro，
 * rendered 形如 L0, expand(M0), L1, expand(M1), ..., Ln，Li 片段逐字携带。
 * 按序前进游标，在 rendered 中逐段做 forward substring 定位——无需全局 token 唯一性。
 *
 * `analysis`（来自 macroSpans.ts 的 ST MacroParser 提取）提供精确宏跨度；缺省时回退
 * 到正则 splitByMacros（只能识别 `{{}}`，对 <USER> 等 legacy 宏和 {{if}} 块无感知）。
 *
 * 两种回退到 token-level wordDiff：raw 中无 macro（无处锚定）；
 * 某字面片段在 rendered 中找不到逐字匹配（macro 吃了相邻空白，或 literal 被插件改），
 * 回退前会先 trim 该片段首尾空白再试一次。
 * 例外：片段落在 scoped block（{{if}}...{{/if}}）内部时，锚定失败视为"条件分支被吃掉"，
 * 直接跳过该片段而不是 wordDiff 吞掉剩余——否则 {{if false}} 会让后面所有字面全部错位。
 */
export function macroAwareDiff(
  raw: string,
  rendered: string,
  analysis?: MacroAnalysis
): { text: string; added: boolean }[] {
  const spans = analysis?.spans;
  const softRanges = analysis?.softRanges ?? [];
  const pieces = spans
    ? splitBySpans(raw, spans)
    : splitByMacros(raw).map((text) => ({ text, start: -1 }));
  if (pieces.length === 1 && !spans) return wordDiff(raw, rendered); // 无 macro——无处锚定

  const out: { text: string; added: boolean }[] = [];
  let cursor = 0;

  for (const piece of pieces) {
    if (!piece.text) continue; // 空片段（相邻 macro，或 macro 紧贴 start/end）——此处无字面可锚

    let idx = rendered.indexOf(piece.text, cursor);
    let matched = piece.text;
    if (idx === -1) {
      // 字面片段未能逐字存活的常见原因：其一侧边缘的 macro（如 {{trim}}）吃了自己相邻的空白。
      // 回退前先 trim 该片段首尾空白再试一次。
      const trimmed = piece.text.trim();
      if (trimmed && (idx = rendered.indexOf(trimmed, cursor)) !== -1) matched = trimmed;
    }

    if (idx === -1) {
      // scoped block 内字面被条件宏吃掉（{{if false}} 分支）——跳过，不吞剩余。
      if (spans && isInside(piece.start, softRanges)) continue;
      // 确实无法逐字锚定此片段——回退到旧的 token-level diff，范围限定为此片段 vs 剩余未消费 rendered 文本。
      const local = wordDiff(piece.text, rendered.slice(cursor));
      for (const seg of local) pushRun(out, seg.text, seg.added);
      cursor = rendered.length; // local wordDiff 已 accounted for 剩余全部
      continue;
    }

    pushRun(out, rendered.slice(cursor, idx), true); // 此 anchor 之前的 gap = 前一个 macro 的展开
    pushRun(out, matched, false);
    cursor = idx + matched.length;
  }

  if (cursor < rendered.length) pushRun(out, rendered.slice(cursor), true); // 尾随 macro 展开（若 raw 以 macro 结尾）

  return out;
}

/**
 * 按宏跨度切字面片段：span 之间（不含 span 本身）的连续文本。
 * start 记录片段在 raw 中的起始偏移，供 softRange 判断。
 */
function splitBySpans(
  text: string,
  spans: { start: number; end: number }[]
): { text: string; start: number }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const pieces: { text: string; start: number }[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue; // 重叠 span（嵌套宏）跳过
    if (s.start > cursor) pieces.push({ text: text.slice(cursor, s.start), start: cursor });
    cursor = s.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), start: cursor });
  return pieces;
}

function isInside(offset: number, ranges: { start: number; end: number }[]): boolean {
  return ranges.some((r) => offset >= r.start && offset <= r.end);
}

/**
 * Word-level diff：`a`=raw 原文，`b`=ST 渲染文本。返回 `b` 的 {text,added} run 序列。
 * 约束：token = 空白 run / ASCII letters+digits+underscore run / 其他单字符，
 * 使 CJK 逐字符对齐且 Latin 词原子化。匹配两层：patience anchoring（diffRange）+ plain LCS（lcsAtoms），
 * 最后 noise-collapse。详见各函数。
 */
function tokenizeForDiff(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
}

type DiffAtom = { text: string; added: boolean; trusted: boolean };

// Plain LCS，一 token 一 atom。base case：patience anchoring 框定的小段，或太小不值得 anchor 的段。
// 这里匹配 `trusted: false`——只是 "某" 合法对齐，不一定是 "那" 正确的。
function lcsAtoms(A: string[], B: string[]): DiffAtom[] {
  const n = A.length,
    m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffAtom[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ text: B[j], added: false, trusted: false });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } // token 仅在 A：从渲染输出中丢
    else {
      out.push({ text: B[j], added: true, trusted: false });
      j++;
    } // token 仅在 B：被替换/插入
  }
  while (j < m) {
    out.push({ text: B[j], added: true, trusted: false });
    j++;
  }
  return out;
}

// 低于此 n*m（post-anchor-split）直接跑 plain LCS——够小够便宜，不值得扫 anchor。
const LCS_FALLBACK_MAX = 2500;
// 总体（pre-split）预算上限——见 wordDiff 顶层调用处。
const DIFF_TOKEN_BUDGET = 4_000_000;

function diffRange(A: string[], B: string[]): DiffAtom[] {
  if (!A.length) return B.length ? [{ text: B.join(''), added: true, trusted: false }] : [];
  if (!B.length) return [];
  if (A.length * B.length <= LCS_FALLBACK_MAX) return lcsAtoms(A, B);

  // 在 BOTH A 和 B 中都恰好出现一次的 token：构造上无歧义，不管别处发生什么。
  const countA = new Map<string, number>(),
    firstA = new Map<string, number>();
  A.forEach((t, idx) => {
    countA.set(t, (countA.get(t) || 0) + 1);
    if (!firstA.has(t)) firstA.set(t, idx);
  });
  const countB = new Map<string, number>(),
    firstB = new Map<string, number>();
  B.forEach((t, idx) => {
    countB.set(t, (countB.get(t) || 0) + 1);
    if (!firstB.has(t)) firstB.set(t, idx);
  });

  const candidates: { ai: number; bi: number }[] = [];
  for (let ai = 0; ai < A.length; ai++) {
    const t = A[ai];
    if (countA.get(t) !== 1 || countB.get(t) !== 1) continue;
    candidates.push({ ai, bi: firstB.get(t)! });
  }
  if (!candidates.length) return lcsAtoms(A, B); // 没有 unique token 可锚——直接回退

  // Anchor 必须保相对顺序（不能 ai=5<->bi=10 和 ai=8<->bi=3 这样交叉）——
  // B-position 的 longest increasing subsequence（按 A 序）是这些 unique 匹配的最大非交叉集。
  const lis = lisIndices(candidates.map((c) => c.bi));
  const anchors = lis.map((idx) => candidates[idx]);

  const out: DiffAtom[] = [];
  let prevA = 0,
    prevB = 0;
  for (const anc of anchors) {
    out.push(...diffRange(A.slice(prevA, anc.ai), B.slice(prevB, anc.bi)));
    out.push({ text: B[anc.bi], added: false, trusted: true });
    prevA = anc.ai + 1;
    prevB = anc.bi + 1;
  }
  out.push(...diffRange(A.slice(prevA), B.slice(prevB)));
  return out;
}

// Longest increasing subsequence，返回 `seq` 的 index（patience sorting）。
// 用于从候选 anchor 对中取最大非交叉集。
function lisIndices(seq: number[]): number[] {
  const parent: number[] = new Array(seq.length).fill(-1);
  const pileTops: number[] = [];
  for (let idx = 0; idx < seq.length; idx++) {
    const v = seq[idx];
    let lo = 0,
      hi = pileTops.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[pileTops[mid]] < v) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) parent[idx] = pileTops[lo - 1];
    if (lo === pileTops.length) pileTops.push(idx);
    else pileTops[lo] = idx;
  }
  const result: number[] = [];
  let k = pileTops.length ? pileTops[pileTops.length - 1] : -1;
  while (k !== -1) {
    result.push(k);
    k = parent[k];
  }
  return result.reverse();
}

// 一个 untrusted（tier-2 LCS）matched run 需要的最少连续 token 数，
// 达不到就当偶发字符碰撞处理——见 wordDiff 末尾的 noise-collapse pass。
const MIN_TRUSTED_RUN = 2;

export function wordDiff(a: string, b: string): { text: string; added: boolean }[] {
  const A = tokenizeForDiff(a),
    B = tokenizeForDiff(b);

  // 先 trim 匹配的 prefix/suffix。预设 block 多为整段相同文本中一两处替换点，
  // 所以单这一步就把 anchoring/DP 工作量缩到实际编辑点附近，不管周围 block 多长。
  // 这些是从整串两端走入的精确匹配——不管多长都可信，同 patience anchor。
  let lo = 0;
  const maxLo = Math.min(A.length, B.length);
  while (lo < maxLo && A[lo] === B[lo]) lo++;
  let hiA = A.length,
    hiB = B.length;
  while (hiA > lo && hiB > lo && A[hiA - 1] === B[hiB - 1]) {
    hiA--;
    hiB--;
  }

  const midA = A.slice(lo, hiA),
    midB = B.slice(lo, hiB);
  const atoms: DiffAtom[] = [];
  for (let k = 0; k < lo; k++) atoms.push({ text: B[k], added: false, trusted: true });
  if (midA.length * midB.length > DIFF_TOKEN_BUDGET) {
    // Edit region 本身太大不好便宜 diff——显示为一个 plain（未高亮）块，
    // 而非冒险做多秒同步计算。它之外的 prefix/suffix 上下仍正确未高亮，所以只退化中间。
    if (midB.length) atoms.push({ text: midB.join(''), added: false, trusted: false });
  } else {
    atoms.push(...diffRange(midA, midB));
  }
  for (let k = hiB; k < B.length; k++) atoms.push({ text: B[k], added: false, trusted: true });

  // 把连续同 `added` 的 atom 合并成 run，跟踪 token 数量与 run 内是否任一 atom 为 trusted
  // （patience anchor 或边界 trim）——被任一 trusted atom 触及的 run 免除下面 noise-collapse 检查，
  // 同足够长的 untrusted run 一样。
  const segs: {
    text: string;
    added: boolean;
    tokens: number;
    anyTrusted: boolean;
  }[] = [];
  for (const at of atoms) {
    const last = segs[segs.length - 1];
    if (last && last.added === at.added) {
      last.text += at.text;
      last.tokens++;
      last.anyTrusted = last.anyTrusted || at.trusted;
    } else
      segs.push({
        text: at.text,
        added: at.added,
        tokens: 1,
        anyTrusted: at.trusted,
      });
  }

  // Noise collapse：夹在两个 highlighted run 之间、token 数少于 MIN_TRUSTED_RUN 的 untrusted matched run，
  // 更可能是偶发残留碰撞（即便 anchor 之后小 gap 仍可能如此解析）而非真正搬过来的字面文本块——
  // 把它折进周围 highlight，而非让它从中间戳个洞。
  const out: { text: string; added: boolean }[] = [];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    const prevAdded = out.length ? out[out.length - 1].added : false;
    const nextAdded = k + 1 < segs.length ? segs[k + 1].added : false;
    const isNoise =
      !seg.added && !seg.anyTrusted && prevAdded && nextAdded && seg.tokens < MIN_TRUSTED_RUN;
    const added = isNoise ? true : seg.added;
    if (out.length && out[out.length - 1].added === added) out[out.length - 1].text += seg.text;
    else out.push({ text: seg.text, added });
  }
  return out;
}
