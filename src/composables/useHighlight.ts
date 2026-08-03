import { esc, span } from '../utils'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript.js'

// 优先级，从高到低：{{}} 宏（始终优先，无条件检查）> <...> > [...] > "..." / '...'
// （引号共享最低层级，彼此不嵌套）。
//
// 规则：一旦进入某优先级的定界符内部，只有严格更高优先级的定界符才能在其内部打开自己的
// 彩色 span——同级或更低优先级的都只是外层 span 的普通内容。所以"<>包裹引号"（尖括号内的引号）
// 使引号不上色（被 <> span 吞没），而"引号包裹<>"（引号内的 <>）仍会让 <> 用自己的颜色高亮，
// 因为 <> 优先级高于引号。
//
// 层级用数字表示（越大优先级越高）：引号=1，方括号=2，尖括号=3。`minTier` 是当前递归深度
// 仍允许打开的最低层级——顶层调用用 1（全部允许）；进入 tier-T 的定界符时递归用 minTier = T + 1。
//
// 当前实现将嵌套定界符扁平化为每个颜色段一个 token（一个 token 拥有自己的文本段，baseCls =
// 最内层包围定界符的 class，等同于文本嵌套在 span 内继承的 class）。所有 hl-* class 在
// main.css 中只设 color（hl-cm 加 font-style），所以嵌套 span 与同级兄弟 span 在视觉上
// 不可区分——没有 border/background 会让结构差异显现。不要添加结构性的 hl-* CSS 属性
// （border, background, box-shadow），否则需重新检验这个假设。

type Tier = 1 | 2 | 3

export interface Token { text: string; cls: string | null }

function findMacroEnd(text: string, start: number): number {
  let depth = 1, j = start + 2
  while (j < text.length && depth > 0) {
    if (j + 1 < text.length && text[j] === '{' && text[j + 1] === '{') { depth++; j += 2 }
    else if (j + 1 < text.length && text[j] === '}' && text[j + 1] === '}') { depth--; j += 2 }
    else j++
  }
  return depth === 0 ? j : -1
}

// 将一个 {{...}} 的内容（含花括号）的 token 推入 `out`。
function pushMacroTokens(out: Token[], inner: string): void {
  out.push({ text: '{{', cls: 'hl-b' })
  if (inner.startsWith('//')) {
    out.push({ text: inner, cls: 'hl-cm' })
  } else {
    const sa = inner.match(/^(setvar|addvar)::([\s\S]+?)::([\s\S]*)$/)
    const ga = !sa && inner.match(/^getvar::([\s\S]+)$/)
    if (sa) {
      out.push({ text: sa[1], cls: 'hl-k' }, { text: '::', cls: 'hl-s' },
                { text: sa[2], cls: 'hl-v' }, { text: '::', cls: 'hl-s' })
      out.push(...scan(sa[3], 0, 1, null, 'hl-val').tokens)
    } else if (ga) {
      out.push({ text: 'getvar', cls: 'hl-k' }, { text: '::', cls: 'hl-s' })
      out.push(...scan(ga[1], 0, 1, null, 'hl-v').tokens)
    } else {
      out.push(...scan(inner, 0, 1, null, 'hl-m').tokens)
    }
  }
  out.push({ text: '}}', cls: 'hl-b' })
}

/**
 * 扫描 `text` 从索引 `start` 开始，如果遇到 `stopChar` 则提前停止（用于在引号/方括号内查找匹配的
 * 闭合符）。`minTier` 是当前仍允许打开新嵌套 span 的最低定界符层级——{{}} 宏不受此限制，无条件检查。
 * `baseCls` 是此递归层级下普通（未匹配）文本的 class——顶层为 null，进入定界符后为包围定界符的 class
 * （模拟文本嵌套在 <span class=X> 内的视觉效果）。返回消费掉的 span 的扁平 token 列表，以及
 * 原始 `text` 中第一个未消费字符的绝对索引——要么是 `stopChar` 的位置（如果找到），要么是
 * `text.length`（未找到）。
 */
function scan(text: string, start: number, minTier: Tier, stopChar: string | null, baseCls: string | null, memo: Map<string, { tokens: Token[]; endIndex: number }> = new Map()): { tokens: Token[]; endIndex: number } {
  // 记忆化：(start, minTier, stopChar) 唯一确定"从 start 找匹配闭合符"这次尝试的结果——
  // baseCls 由 (minTier, stopChar) 决定，不需要进 key。缺记忆化时，一串连续未匹配的定界符
  // （典型场景：JS 代码里一串没有对应 `>` 的比较运算符 `<`）会让每个起点各自重新扫一遍它之后
  // 的全部后续定界符——嵌套调用之间不共享任何已算出的结果，构成指数级重复计算（scan(p_k) 内部
  // 完整重跑一遍 scan(p_k+1)、scan(p_k+2)……而这些子调用又各自重跑一遍它们自己之后的），
  // 几十个未匹配定界符就能卡死几秒到几分钟。记忆化后每个 (start, minTier, stopChar) 只真正
  // 计算一次，后续命中直接复用，指数级砍成线性。
  const key = start + '\u0000' + minTier + '\u0000' + (stopChar ?? '')
  const cached = memo.get(key)
  if (cached) return cached

  const out: Token[] = []
  let i = start, plainStart = start
  const flushPlain = (upTo: number) => { if (upTo > plainStart) out.push({ text: text.substring(plainStart, upTo), cls: baseCls }) }
  const finish = (result: { tokens: Token[]; endIndex: number }) => { memo.set(key, result); return result }

  while (i < text.length) {
    if (stopChar !== null && text[i] === stopChar) {
      // 闭合单引号的 word-boundary 检查，模拟原 regex 的 (?!\w)
      if ((stopChar === "'" || stopChar === '\u2019') && /\w/.test(text[i + 1] || '')) { i++; continue }
      flushPlain(i)
      return finish({ tokens: out, endIndex: i })
    }

    // 每个嵌套层级无条件检查：{{ macro }} 始终优先。
    if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) {
        flushPlain(i)
        pushMacroTokens(out, text.substring(i + 2, end - 2))
        i = end; plainStart = i
        continue
      }
    }

    // Tier 3：<...> — 内部只能打开 {{}}（无条件）和另一个嵌套 <...>；
    // 内部 minTier 保持在 3（不是 4），这样双重的 "<<>>" 能递归着色两层，
    // 而不是外层 span 遇到第一个 ">" 就停下，剩下内容变纯文本。
    if (minTier <= 3 && text[i] === '<') {
      const inner = scan(text, i + 1, 3, '>', 'hl-ab', memo)
      if (inner.endIndex < text.length && text[inner.endIndex] === '>') {
        flushPlain(i)
        out.push({ text: '<', cls: 'hl-ab' }, ...inner.tokens, { text: '>', cls: 'hl-ab' })
        i = inner.endIndex + 1; plainStart = i
        continue
      }
    }

    // Tier 2：[...] — 更高优先级的 <...> 可以在内部打开，另一个嵌套 [...] 也可以
    // （内部 minTier 保持在 2，和 <> 同理，支持 "[[]]"）。
    if (minTier <= 2 && text[i] === '[') {
      const inner = scan(text, i + 1, 2, ']', 'hl-sb', memo)
      if (inner.endIndex < text.length && text[inner.endIndex] === ']') {
        flushPlain(i)
        out.push({ text: '[', cls: 'hl-sb' }, ...inner.tokens, { text: ']', cls: 'hl-sb' })
        i = inner.endIndex + 1; plainStart = i
        continue
      }
    }

    // Tier 1: 中文双引号 “...” — 颜色同英文双引号
    if (minTier <= 1 && text[i] === '\u201C') {  // U+201C = “
      const cls = 'hl-dq'
      const inner = scan(text, i + 1, 2, '\u201D', cls, memo)  // stopChar = ” (U+201D)
      if (inner.endIndex < text.length && text[inner.endIndex] === '\u201D') {
        flushPlain(i)
        out.push({ text: '\u201C', cls }, ...inner.tokens, { text: '\u201D', cls })
        i = inner.endIndex + 1
        plainStart = i
        continue
      }
    }

    // Tier 1: 中文单引号 ‘...’ — 颜色同英文单引号
    if (minTier <= 1 && text[i] === '\u2018') {  // U+2018 = ‘
      const cls = 'hl-sq'
      const inner = scan(text, i + 1, 2, '\u2019', cls, memo)  // stopChar = ’ (U+2019)
      if (inner.endIndex < text.length && text[inner.endIndex] === '\u2019') {
        flushPlain(i)
        out.push({ text: '\u2018', cls }, ...inner.tokens, { text: '\u2019', cls })
        i = inner.endIndex + 1
        plainStart = i
        continue
      }
    }

    if (minTier <= 1 && text[i] === '\u300C') { 
      const cls = 'hl-dq' 
      const inner = scan(text, i + 1, 2, '\u300D', cls, memo)
      if (inner.endIndex < text.length && text[inner.endIndex] === '\u300D') {
        flushPlain(i)
        out.push({ text: '\u300C', cls }, ...inner.tokens, { text: '\u300D', cls })
        i = inner.endIndex + 1
        plainStart = i
        continue
      }
    }

    // Tier 1："..." 或 '...'（同一层级，彼此不嵌套）—— <...> 和 [...] 都能在引号内
    // 打开并高亮，因为两者优先级高于引号。
    if (minTier <= 1 && (text[i] === '"' || text[i] === "'")) {
      const qc = text[i]
      // 对起始引号也做 word-boundary 防护，例如 "it's" 不会把撇号当作引号起始符
      // （它实际是缩写的一部分）。
      const prevOk = qc === "'" ? !/\w/.test(text[i - 1] || '') : true
      if (prevOk) {
        const cls = qc === '"' ? 'hl-dq' : 'hl-sq'
        const inner = scan(text, i + 1, 2, qc, cls, memo)
        if (inner.endIndex < text.length && text[inner.endIndex] === qc) {
          flushPlain(i)
          out.push({ text: qc, cls }, ...inner.tokens, { text: qc, cls })
          i = inner.endIndex + 1; plainStart = i
          continue
        }
      }
    }

    i++
  }
  flushPlain(text.length)
  return finish({ tokens: out, endIndex: text.length })
}

function tokenize(text: string): Token[] {
  return scan(text, 0, 1, null, null).tokens
}

export type HighlightLanguage = 'macro' | 'js'

// Prism.tokenize() 返回值是 (string | Prism.Token)[]，Token.content 又可以是
// string | Prism.Token | (string | Prism.Token)[]（同类型递归嵌套）——这里把它拍平成
// 我们自己的扁平 {text, cls}[]，好让 highlightContent/highlightLines 复用同一套
// 拼 HTML / 按行切割逻辑，不用关心具体是哪个 tokenizer 产出的。
// class 名前缀 hl-js-，跟 Prism 的 token.type 一一对应（keyword/string/comment/number/
// function/operator/punctuation/...），颜色在 main.css 里配，规则跟其余 hl-* 一样：
// 只设 color，不设 border/background。
function flattenPrismTokens(tokens: (string | Prism.Token)[], out: Token[] = []): Token[] {
  for (const t of tokens) {
    if (typeof t === 'string') {
      if (t) out.push({ text: t, cls: null })
      continue
    }
    const content = Array.isArray(t.content) ? t.content : [t.content]
    const before = out.length
    flattenPrismTokens(content, out)
    // t.content 也可能直接是字符串（不是数组/嵌套 Token），上面已经统一转成数组处理；
    // 这里把这次递归新产出的 token 全部打上当前 token.type 的 class——因为 Prism 的
    // token.content 里嵌套的字符串没有自己的 cls，需要从外层继承。
    for (let i = before; i < out.length; i++) if (out[i].cls === null) out[i].cls = `hl-js-${t.type}`
  }
  return out
}

function tokenizeJs(text: string): Token[] {
  return flattenPrismTokens(Prism.tokenize(text, Prism.languages.javascript))
}

function tokenizeFor(language: HighlightLanguage, text: string): Token[] {
  return language === 'js' ? tokenizeJs(text) : tokenize(text)
}

/** 将全文高亮为一个 HTML 字符串（macro/引号内容会递归进去），供复制导出等场景使用。
 *  `language` 默认 'macro'（酒馆宏语法，四个域共用）；tavern_helper 脚本内容传 'js'
 *  走 Prism 的真正 JS 语法高亮——脚本内容是纯 JS，不会混 ST 宏，所以两套 tokenizer
 *  互不需要感知对方，按 language 分流即可，不用合并。 */
export function highlightContent(text: string, language: HighlightLanguage = 'macro'): string {
  let out = ''
  for (const t of tokenizeFor(language, text)) {
    const e = esc(t.text)
    out += t.cls ? span(t.cls, e) : e
  }
  return out
}

/**
 * 同样高亮，但按逻辑行分割为每行一个 HTML 字符串（与 `text.split('\n')` 对齐）。
 * token 文本可能包含 '\n'（宏/定界符/引号/JS 模板字符串/块注释都允许跨行），所以必须在
 * token 流上分割，每行重新打开同一 class，而不是在组装好的 HTML 上按 '\n' 切割（会切坏
 * <span>）。空行输出单个 U+00A0 而非 ''——空块元素在某些浏览器中高度为 0，会导致与
 * textarea 行高不同步。
 */
export function highlightLines(text: string, language: HighlightLanguage = 'macro'): string[] {
  const lines: string[] = ['']
  for (const t of tokenizeFor(language, text)) {
    const parts = t.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) lines.push('')
      if (!parts[p]) continue
      const e = esc(parts[p])
      lines[lines.length - 1] += t.cls ? span(t.cls, e) : e
    }
  }
  for (let i = 0; i < lines.length; i++) if (!lines[i]) lines[i] = '\u00A0'
  return lines
}
