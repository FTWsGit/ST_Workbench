import type { PresetData, PresetBlock } from './types'

export function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function span(cls: string, inner: string): string {
  return `<span class="${cls}">${inner}</span>`
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** setvar/addvar/getvar 的 badge label + CSS class 映射。 */
export function varOpBadge(type: 'setvar' | 'addvar' | 'get'): { cls: string; label: string } {
  if (type === 'setvar') return { cls: 'set', label: 'SET' }
  if (type === 'addvar') return { cls: 'add', label: 'ADD' }
  return { cls: 'get', label: 'GET' }
}

/** prompt block 的 role → CSS class 后缀（'user'/'asst'/'sys'），可加 prefix。 */
export function roleClass(role: string | undefined, prefix = ''): string {
  const suffix = role === 'user' ? 'user' : role === 'assistant' ? 'asst' : 'sys'
  return prefix + suffix
}

export interface OrderedBlockEntry { block: PresetBlock; hidden: boolean }

/** 把 prompt_order 展开成视觉顺序的 block 列表（忽略 group 边界）。
 *  存在于 prompts 但未在 prompt_order 中引用的 hidden block 追加在末尾，标记 hidden: true。
 *  指向已删除 prompt 的悬空 order 条目静默跳过；同一 identifier 的重复条目只在首次位置出现。 */
export function orderedPromptsWithHidden(data: PresetData): OrderedBlockEntry[] {
  const byId = new Map(data.prompts.map(p => [p.identifier, p]))
  const seen = new Set<string>()
  const out: OrderedBlockEntry[] = []
  const rawOrder = (Array.isArray(data.prompt_order) && data.prompt_order.length)
    ? (data.prompt_order.find((p: any) => p.character_id === 100001)?.order ?? [])
    : []
  for (const item of rawOrder) {
    if (seen.has(item.identifier)) continue
    const b = byId.get(item.identifier)
    if (!b) continue
    seen.add(item.identifier)
    out.push({ block: b, hidden: false })
  }
  for (const b of data.prompts) {
    if (!seen.has(b.identifier)) out.push({ block: b, hidden: true })
  }
  return out
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }) as unknown as T
}

/** 找到 `{{` 起始处匹配的 `}}` 后那个 index，处理嵌套 `{{...}}`。未匹配返回 -1。 */
export function findMacroEnd(text: string, start: number): number {
  let depth = 1, j = start + 2
  while (j < text.length && depth > 0) {
    if (text[j] === '{' && text[j + 1] === '{') { depth++; j += 2 }
    else if (text[j] === '}' && text[j + 1] === '}') { depth--; j += 2 }
    else j++
  }
  return depth === 0 ? j : -1
}

/** 从 `text` 中整体移除每个 `{{...}}` macro span。
 *  diff 前用：macro 自身的源字符（名字、`::`、变量名）与展开值无对应关系，
 *  整段移除而非占位符替换，保证 macro 整段展开值高亮为连续 span。 */
export function stripMacros(text: string): string {
  let out = '', i = 0
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) { i = end; continue }
    }
    out += text[i]; i++
  }
  return out
}

export interface VarOpMatch {
  type: 'setvar' | 'addvar' | 'get'
  varName: string
  varValue: string
  pos: number   // 此 macro 起始 `{{` 在 text 中的绝对 index
  end: number   // 此 macro TRUE（嵌套感知）闭合 `}}` 之后的绝对 index
  line: number  // 0-based
  col: number   // 0-based，变量名所在列（非 `{{`），沿用 VarOp 的现有约定
}

/** 扫描 `text` 中所有 `{{setvar/addvar/getvar}}`，包括嵌套在另一 macro 值中的。
 *  用深度感知的 `{{`/`}}` 匹配找到每个 macro 的 TRUE end，再递归进 setvar/addvar 的值取嵌套 var op。 */
export function findVarOps(text: string): VarOpMatch[] {
  const out: VarOpMatch[] = []

  function lineColOf(bracePos: number, nameStart: number) {
    const before = text.slice(0, bracePos)
    const line = (before.match(/\n/g) || []).length
    const lastNl = before.lastIndexOf('\n')
    return { line, col: nameStart - lastNl - 1 }
  }

  function scan(from: number, to: number) {
    let i = from
    while (i < to) {
      if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end === -1 || end > to) { i++; continue } // 未匹配或超出范围，当字面量
        const innerStart = i + 2
        const innerEnd = end - 2 // start of the closing `}}`
        const inner = text.slice(innerStart, innerEnd)

        let matchedVarOp = false
        for (const type of ['setvar', 'addvar'] as const) {
          const prefix = type + '::'
          if (inner.startsWith(prefix)) {
            const after = innerStart + prefix.length
            const sep = text.indexOf('::', after)
            if (sep !== -1 && sep < innerEnd) {
              const varName = text.slice(after, sep).trim()
              const valueStart = sep + 2
              const { line, col } = lineColOf(i, after)
              out.push({ type, varName, varValue: text.slice(valueStart, innerEnd), pos: i, end, line, col })
              scan(valueStart, innerEnd) // 取 setvar/addvar 值内嵌套的 var op
              matchedVarOp = true
            }
            break
          }
        }
        if (!matchedVarOp && inner.startsWith('getvar::')) {
          const after = innerStart + 'getvar::'.length
          const varName = text.slice(after, innerEnd).trim()
          const { line, col } = lineColOf(i, after)
          out.push({ type: 'get', varName, varValue: '', pos: i, end, line, col })
          matchedVarOp = true
        }
        if (!matchedVarOp) scan(innerStart, innerEnd) // 其他 macro，其 args 内可能仍嵌套 var op

        i = end
        continue
      }
      i++
    }
  }

  scan(0, text.length)
  return out
}

/**
 * 把 `text` 按 top-level `{{...}}` macro 切成字面片段（macro 自身移除），保留顺序。
 * n 个 macro → n+1 个片段，任一片段可为空字符串。macroAwareDiff 用它锚定字面文本。
 */
function splitByMacros(text: string): string[] {
  const pieces: string[] = []
  let out = '', i = 0
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) { pieces.push(out); out = ''; i = end; continue }
    }
    out += text[i]; i++
  }
  pieces.push(out)
  return pieces
}

function pushRun(out: { text: string; added: boolean }[], text: string, added: boolean) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.added === added) last.text += text
  else out.push({ text, added })
}

/**
 * macro 边界锚定的 diff：`raw` 含 `{{}}` macro，`rendered` 是 ST 真实渲染文本。
 * 把 raw 拆成 L0, {{M0}}, L1, {{M1}}, ..., Ln；因 ST 原位替换 macro，
 * rendered 形如 L0, expand(M0), L1, expand(M1), ..., Ln，Li 片段逐字携带。
 * 按序前进游标，在 rendered 中逐段做 forward substring 定位——无需全局 token 唯一性。
 *
 * 两种回退到 token-level wordDiff：raw 中无 macro（无处锚定）；
 * 某字面片段在 rendered 中找不到逐字匹配（macro 吃了相邻空白，或 literal 被插件改），
 * 回退前会先 trim 该片段首尾空白再试一次。
 */
export function macroAwareDiff(raw: string, rendered: string): { text: string; added: boolean }[] {
  const pieces = splitByMacros(raw)
  if (pieces.length === 1) return wordDiff(raw, rendered) // 无 macro——无处锚定

  const out: { text: string; added: boolean }[] = []
  let cursor = 0

  for (const piece of pieces) {
    if (!piece) continue // 空片段（相邻 macro，或 macro 紧贴 start/end）——此处无字面可锚

    let idx = rendered.indexOf(piece, cursor)
    let matched = piece
    if (idx === -1) {
      // 字面片段未能逐字存活的常见原因：其一侧边缘的 macro（如 {{trim}}）吃了自己相邻的空白。
      // 回退前先 trim 该片段首尾空白再试一次。
      const trimmed = piece.trim()
      if (trimmed && (idx = rendered.indexOf(trimmed, cursor)) !== -1) matched = trimmed
    }

    if (idx === -1) {
      // 确实无法逐字锚定此片段——回退到旧的 token-level diff，范围限定为此片段 vs 剩余未消费 rendered 文本。
      const local = wordDiff(piece, rendered.slice(cursor))
      for (const seg of local) pushRun(out, seg.text, seg.added)
      cursor = rendered.length // local wordDiff 已 accounted for 剩余全部
      continue
    }

    pushRun(out, rendered.slice(cursor, idx), true) // 此 anchor 之前的 gap = 前一个 macro 的展开
    pushRun(out, matched, false)
    cursor = idx + matched.length
  }

  if (cursor < rendered.length) pushRun(out, rendered.slice(cursor), true) // 尾随 macro 展开（若 raw 以 macro 结尾）

  return out
}

/**
 * Word-level diff：`a`=raw 原文，`b`=ST 渲染文本。返回 `b` 的 {text,added} run 序列。
 * 约束：token = 空白 run / ASCII letters+digits+underscore run / 其他单字符，
 * 使 CJK 逐字符对齐且 Latin 词原子化。匹配两层：patience anchoring（diffRange）+ plain LCS（lcsAtoms），
 * 最后 noise-collapse。详见各函数。
 */
function tokenizeForDiff(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []
}

type DiffAtom = { text: string; added: boolean; trusted: boolean }

// Plain LCS，一 token 一 atom。base case：patience anchoring 框定的小段，或太小不值得 anchor 的段。
// 这里匹配 `trusted: false`——只是 "某" 合法对齐，不一定是 "那" 正确的。
function lcsAtoms(A: string[], B: string[]): DiffAtom[] {
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffAtom[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ text: B[j], added: false, trusted: false }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { i++ } // token 仅在 A：从渲染输出中丢
    else { out.push({ text: B[j], added: true, trusted: false }); j++ } // token 仅在 B：被替换/插入
  }
  while (j < m) { out.push({ text: B[j], added: true, trusted: false }); j++ }
  return out
}

// 低于此 n*m（post-anchor-split）直接跑 plain LCS——够小够便宜，不值得扫 anchor。
const LCS_FALLBACK_MAX = 2500
// 总体（pre-split）预算上限——见 wordDiff 顶层调用处。
const DIFF_TOKEN_BUDGET = 4_000_000

function diffRange(A: string[], B: string[]): DiffAtom[] {
  if (!A.length) return B.length ? [{ text: B.join(''), added: true, trusted: false }] : []
  if (!B.length) return []
  if (A.length * B.length <= LCS_FALLBACK_MAX) return lcsAtoms(A, B)

  // 在 BOTH A 和 B 中都恰好出现一次的 token：构造上无歧义，不管别处发生什么。
  const countA = new Map<string, number>(), firstA = new Map<string, number>()
  A.forEach((t, idx) => { countA.set(t, (countA.get(t) || 0) + 1); if (!firstA.has(t)) firstA.set(t, idx) })
  const countB = new Map<string, number>(), firstB = new Map<string, number>()
  B.forEach((t, idx) => { countB.set(t, (countB.get(t) || 0) + 1); if (!firstB.has(t)) firstB.set(t, idx) })

  const candidates: { ai: number; bi: number }[] = []
  for (let ai = 0; ai < A.length; ai++) {
    const t = A[ai]
    if (countA.get(t) !== 1 || countB.get(t) !== 1) continue
    candidates.push({ ai, bi: firstB.get(t)! })
  }
  if (!candidates.length) return lcsAtoms(A, B) // 没有 unique token 可锚——直接回退

  // Anchor 必须保相对顺序（不能 ai=5<->bi=10 和 ai=8<->bi=3 这样交叉）——
  // B-position 的 longest increasing subsequence（按 A 序）是这些 unique 匹配的最大非交叉集。
  const lis = lisIndices(candidates.map(c => c.bi))
  const anchors = lis.map(idx => candidates[idx])

  const out: DiffAtom[] = []
  let prevA = 0, prevB = 0
  for (const anc of anchors) {
    out.push(...diffRange(A.slice(prevA, anc.ai), B.slice(prevB, anc.bi)))
    out.push({ text: B[anc.bi], added: false, trusted: true })
    prevA = anc.ai + 1; prevB = anc.bi + 1
  }
  out.push(...diffRange(A.slice(prevA), B.slice(prevB)))
  return out
}

// Longest increasing subsequence，返回 `seq` 的 index（patience sorting）。
// 用于从候选 anchor 对中取最大非交叉集。
function lisIndices(seq: number[]): number[] {
  const parent: number[] = new Array(seq.length).fill(-1)
  const pileTops: number[] = []
  for (let idx = 0; idx < seq.length; idx++) {
    const v = seq[idx]
    let lo = 0, hi = pileTops.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[pileTops[mid]] < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) parent[idx] = pileTops[lo - 1]
    if (lo === pileTops.length) pileTops.push(idx)
    else pileTops[lo] = idx
  }
  const result: number[] = []
  let k = pileTops.length ? pileTops[pileTops.length - 1] : -1
  while (k !== -1) { result.push(k); k = parent[k] }
  return result.reverse()
}

// 一个 untrusted（tier-2 LCS）matched run 需要的最少连续 token 数，
// 达不到就当偶发字符碰撞处理——见 wordDiff 末尾的 noise-collapse pass。
const MIN_TRUSTED_RUN = 2

export function wordDiff(a: string, b: string): { text: string; added: boolean }[] {
  const A = tokenizeForDiff(a), B = tokenizeForDiff(b)

  // 先 trim 匹配的 prefix/suffix。预设 block 多为整段相同文本中一两处替换点，
  // 所以单这一步就把 anchoring/DP 工作量缩到实际编辑点附近，不管周围 block 多长。
  // 这些是从整串两端走入的精确匹配——不管多长都可信，同 patience anchor。
  let lo = 0
  const maxLo = Math.min(A.length, B.length)
  while (lo < maxLo && A[lo] === B[lo]) lo++
  let hiA = A.length, hiB = B.length
  while (hiA > lo && hiB > lo && A[hiA - 1] === B[hiB - 1]) { hiA--; hiB-- }

  const midA = A.slice(lo, hiA), midB = B.slice(lo, hiB)
  const atoms: DiffAtom[] = []
  for (let k = 0; k < lo; k++) atoms.push({ text: B[k], added: false, trusted: true })
  if (midA.length * midB.length > DIFF_TOKEN_BUDGET) {
    // Edit region 本身太大不好便宜 diff——显示为一个 plain（未高亮）块，
    // 而非冒险做多秒同步计算。它之外的 prefix/suffix 上下仍正确未高亮，所以只退化中间。
    if (midB.length) atoms.push({ text: midB.join(''), added: false, trusted: false })
  } else {
    atoms.push(...diffRange(midA, midB))
  }
  for (let k = hiB; k < B.length; k++) atoms.push({ text: B[k], added: false, trusted: true })

  // 把连续同 `added` 的 atom 合并成 run，跟踪 token 数量与 run 内是否任一 atom 为 trusted
  // （patience anchor 或边界 trim）——被任一 trusted atom 触及的 run 免除下面 noise-collapse 检查，
  // 同足够长的 untrusted run 一样。
  const segs: { text: string; added: boolean; tokens: number; anyTrusted: boolean }[] = []
  for (const at of atoms) {
    const last = segs[segs.length - 1]
    if (last && last.added === at.added) { last.text += at.text; last.tokens++; last.anyTrusted = last.anyTrusted || at.trusted }
    else segs.push({ text: at.text, added: at.added, tokens: 1, anyTrusted: at.trusted })
  }

  // Noise collapse：夹在两个 highlighted run 之间、token 数少于 MIN_TRUSTED_RUN 的 untrusted matched run，
  // 更可能是偶发残留碰撞（即便 anchor 之后小 gap 仍可能如此解析）而非真正搬过来的字面文本块——
  // 把它折进周围 highlight，而非让它从中间戳个洞。
  const out: { text: string; added: boolean }[] = []
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]
    const prevAdded = out.length ? out[out.length - 1].added : false
    const nextAdded = k + 1 < segs.length ? segs[k + 1].added : false
    const isNoise = !seg.added && !seg.anyTrusted && prevAdded && nextAdded && seg.tokens < MIN_TRUSTED_RUN
    const added = isNoise ? true : seg.added
    if (out.length && out[out.length - 1].added === added) out[out.length - 1].text += seg.text
    else out.push({ text: seg.text, added })
  }
  return out
}

export interface MultiSelectState<T> {
  selected: Set<T>
  anchor: T | null
}

/**
 * 共享的 plain/ctrl/shift 多选语义——主编辑器 block list（Sidebar.vue，经 presetStore selectBlock）
 * 与 CopyPanel.vue 两份独立 block list 共用同一套点击模型。
 *
 * `id`：caller 用来标识可选行的东西（主侧栏是 flatNodes 数值 index，CopyPanel 是 string block identifier）。
 * `all`：列表当前屏幕顺序下的全部可选 id——仅 shift-range 情况需要，按视觉顺序从 anchor 走到点击行，
 * 而非对 id 直接做 Math.min/max（后者只对连续整数 id 成立）。
 *
 * 语义（镜像 presetStore selectBlock()）：
 *  - plain click：若此行是唯一选中行，再点一次清空选中；否则选中变为仅此行，它也成为新 anchor。
 *  - ctrl+click：在现有选中里 toggle 此行；无论加入还是移除都成为新 anchor。
 *  - shift+click：需已有 anchor（否则 no-op）——选 anchor 与此行之间的所有行（含两端，按 `all` 顺序）。
 *    anchor 本身不动，所以重复 shift-click 从同一固定起点继续扩展/收缩范围。
 *
 * Pure/无 mutation——caller 把返回 state 赋回自己的 ref，对 Pinia store action 或组件本地 ref 都一样。
 */
export function applyMultiSelect<T>(
  state: MultiSelectState<T>,
  id: T,
  all: T[],
  opts: { ctrl?: boolean; shift?: boolean }
): MultiSelectState<T> {
  const hasCtrl = opts.ctrl ?? false
  const hasShift = opts.shift ?? false
  if (!hasCtrl && !hasShift) {
    if (state.selected.size === 1 && state.selected.has(id)) return { selected: new Set(), anchor: null }
    return { selected: new Set([id]), anchor: id }
  }
  if (hasShift && state.anchor !== null) {
    const ai = all.indexOf(state.anchor), bi = all.indexOf(id)
    if (ai === -1 || bi === -1) return state
    const lo = Math.min(ai, bi), hi = Math.max(ai, bi)
    const next = new Set<T>()
    for (let i = lo; i <= hi; i++) next.add(all[i])
    return { selected: next, anchor: state.anchor }
  }
  if (hasCtrl) {
    const next = new Set(state.selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    return { selected: next, anchor: id }
  }
  return state
}
