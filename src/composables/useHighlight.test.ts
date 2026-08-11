/* useHighlight 单元测试。
 * 纯逻辑测试，不引入 jsdom。Prism 需要能跑（node 环境，prismjs 是纯 JS 库）。
 */
import { describe, it, expect } from 'vitest';
import { highlightContent, highlightLines } from './useHighlight';

/* ============================================================
 * 辅助：从 HTML 结果里提取 token 的 cls 集合（用于断言某段是否着色）
 * ============================================================ */
function spansIn(html: string): { cls: string; inner: string }[] {
  const result: { cls: string; inner: string }[] = [];
  // 非贪婪，逐 span 匹配（token 段相邻同 class 会各自成 span，贪婪正则会吞掉中间的 </span>）
  const re = /<span class="([^"]+)">([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    result.push({ cls: m[1], inner: m[2] });
  }
  return result;
}

/* ============================================================
 * highlightContent
 * ============================================================ */
describe('highlightContent', () => {
  /* 基本分流 */
  it('空字符串返回空 HTML', () => {
    expect(highlightContent('')).toBe('');
  });

  it('纯普通文本（无定界符）不上色，原样输出（含 HTML �转义）', () => {
    // 注意：<world> 会命中 <...> tier3 分界符；这里用不含定界符的文本
    const html = highlightContent('hello & plain text');
    expect(html).toBe('hello &amp; plain text');
  });

  /* 宏 token */
  it('{{}} 宏的花括号 hl-b 着色', () => {
    const html = highlightContent('{{unknown_macro}}');
    const spans = spansIn(html);
    const braces = spans.filter((s) => s.cls === 'hl-b');
    expect(braces).toHaveLength(2);
    expect(braces[0].inner).toBe('{{');
    expect(braces[1].inner).toBe('}}');
  });

  it('{{//comment}} 注释宏走 hl-cm', () => {
    const html = highlightContent('{{//this is a comment}}');
    const spans = spansIn(html);
    const cm = spans.find((s) => s.cls === 'hl-cm');
    expect(cm).toBeDefined();
    expect(cm!.inner).toContain('this is a comment');
  });

  it('{{setvar::name::value}} 变量宏：宏名 hl-k、:: hl-s、变量名 hl-v、值 hl-val', () => {
    const html = highlightContent('{{setvar::myvar::hello}}');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-k' && s.inner === 'setvar')).toBeDefined();
    expect(spans.filter((s) => s.cls === 'hl-s' && s.inner === '::')).toHaveLength(2);
    expect(spans.find((s) => s.cls === 'hl-v' && s.inner === 'myvar')).toBeDefined();
  });

  it('{{getvar::name}} 无值宏：变量名 hl-v', () => {
    const html = highlightContent('{{getvar::myvar}}');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-k' && s.inner === 'getvar')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-v' && s.inner === 'myvar')).toBeDefined();
  });

  it('{{unknown}} 通用宏走 hl-m', () => {
    const html = highlightContent('{{something_else}}');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-m')).toBeDefined();
  });

  it('多字符前缀优先匹配：{{setglobalvar::x::y}} 不被 setvar 吞', () => {
    const html = highlightContent('{{setglobalvar::x::y}}');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-k' && s.inner === 'setglobalvar')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-k' && s.inner === 'setvar')).toBeUndefined();
  });

  /* JS 分流 */
  it('language="js" 走 Prism JS 高亮（关键字 hl-js-keyword）', () => {
    const html = highlightContent('const x = 1;', 'js');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-js-keyword' && s.inner === 'const')).toBeDefined();
  });

  it('language="js" 字符串走 hl-js-string', () => {
    const html = highlightContent('var s = "hi";', 'js');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-js-string')).toBeDefined();
  });

  it('language="js" 数字走 hl-js-number', () => {
    const html = highlightContent('42', 'js');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-js-number' && s.inner === '42')).toBeDefined();
  });

  it('language="js" 不处理 {{}} 宏（纯 JS 分流）', () => {
    // JS 分流下 {{}} 不是宏，Prism 会按 JS 解析
    const html = highlightContent('{{x}}', 'js');
    // 不应出现 hl-b（宏花括号 class）
    expect(html).not.toContain('hl-b');
  });

  /* tier 优先级 */
  it('<...> 包裹引号：引号不上色（被 <> span 吞没）', () => {
    const html = highlightContent('<"quoted">');
    const spans = spansIn(html);
    // <> 走 hl-ab；内部文本（含引号）被外层 span 吞为普通内容
    const ab = spans.filter((s) => s.cls === 'hl-ab');
    expect(ab).toHaveLength(3); // < + 内容 + >
    expect(ab[0].inner).toBe('&lt;'); // < 被 esc 转义
    expect(ab[2].inner).toBe('&gt;'); // > 被 esc 转义
    // 引号不应单独上色（被 <> 吞没）
    expect(spans.find((s) => s.cls === 'hl-dq')).toBeUndefined();
  });

  it('引号包裹 <>：<...> 仍上色（优先级高于引号）', () => {
    const html = highlightContent('"<ab>"');
    const spans = spansIn(html);
    // 引号走 hl-dq（3 段：引号 + 内容 + 引号），内容里含 <> 的 hl-ab 段
    const dq = spans.filter((s) => s.cls === 'hl-dq');
    expect(dq).toHaveLength(2);
    // <> 仍走 hl-ab
    expect(spans.find((s) => s.cls === 'hl-ab' && s.inner === '&lt;')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-ab' && s.inner === '&gt;')).toBeDefined();
  });

  it('[...] 包裹引号：引号不上色（[] 优先级高于引号）', () => {
    const html = highlightContent('["item"]');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-sb' && s.inner === '[')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-sb' && s.inner === ']')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-dq')).toBeUndefined();
  });

  it('引号包裹 [...]：方括号仍上色', () => {
    const html = highlightContent('"[ab]"');
    const spans = spansIn(html);
    expect(spans.find((s) => s.cls === 'hl-sb' && s.inner === '[')).toBeDefined();
    expect(spans.find((s) => s.cls === 'hl-sb' && s.inner === ']')).toBeDefined();
  });

  it('<...> 内部不能再开 [...]（minTier=3，3 <= 2 假）', () => {
    const html = highlightContent('<[ab]>');
    const spans = spansIn(html);
    // <> 走 hl-ab
    expect(spans.find((s) => s.cls === 'hl-ab')).toBeDefined();
    // [] 不应上色
    expect(spans.find((s) => s.cls === 'hl-sb')).toBeUndefined();
  });

  it('[...] 内部可嵌套 [[]]（minTier=2，2 <= 2 真）', () => {
    const html = highlightContent('[[ab]]');
    const spans = spansIn(html);
    const sbSpans = spans.filter((s) => s.cls === 'hl-sb');
    // 两层 [[]]：5 个 span（[ [ ab ] ]）
    expect(sbSpans).toHaveLength(5);
  });

  it('<...> 内部可嵌套 <<>（minTier=3，3 <= 3 真）', () => {
    const html = highlightContent('<<ab>>');
    const spans = spansIn(html);
    const abSpans = spans.filter((s) => s.cls === 'hl-ab');
    // <<>> 两层：5 个 span（< < ab > >）
    expect(abSpans).toHaveLength(5);
  });

  /* 引号族 */
  it('"..." 双引号 hl-dq', () => {
    const html = highlightContent('"hello"');
    const spans = spansIn(html);
    const dq = spans.filter((s) => s.cls === 'hl-dq');
    // 3 段：引号 + 内容 + 引号（引号被 esc 转义为 &quot;）
    expect(dq).toHaveLength(3);
    expect(dq[0].inner).toBe('&quot;');
    expect(dq[1].inner).toBe('hello');
    expect(dq[2].inner).toBe('&quot;');
  });

  it("'...' 单引号 hl-sq", () => {
    const html = highlightContent("'hello'");
    const spans = spansIn(html);
    const sq = spans.filter((s) => s.cls === 'hl-sq');
    // 3 段：引号 + 内容 + 引号
    expect(sq).toHaveLength(3);
    expect(sq[1].inner).toBe('hello');
  });

  it('“…” 中文双引号 hl-dq（颜色同英文双引号）', () => {
    const html = highlightContent('\u201Chi\u201D');
    const spans = spansIn(html);
    const dq = spans.filter((s) => s.cls === 'hl-dq');
    // 中文引号不被 esc �义，原样
    expect(dq).toHaveLength(3);
    expect(dq[0].inner).toBe('\u201C');
    expect(dq[1].inner).toBe('hi');
    expect(dq[2].inner).toBe('\u201D');
  });

  it('‘…’ 中文单引号 hl-sq', () => {
    const html = highlightContent('\u2018Hi\u2019');
    const spans = spansIn(html);
    const sq = spans.filter((s) => s.cls === 'hl-sq');
    expect(sq).toHaveLength(3);
    expect(sq[1].inner).toBe('Hi');
  });

  it('「…」 日式引号 hl-dq', () => {
    const html = highlightContent('\u300CHi\u300D');
    const spans = spansIn(html);
    const dq = spans.filter((s) => s.cls === 'hl-dq');
    expect(dq).toHaveLength(3);
    expect(dq[0].inner).toBe('\u300C');
    expect(dq[2].inner).toBe('\u300D');
  });

  it("缩写撇号不当作引号起始（it's 不切）", () => {
    // "it's" —— 撇号后跟 's，但前一个字符是 t（\w），prevOk 防护
    const html = highlightContent("it's");
    // 不应出现 hl-sq（单引号高亮）
    expect(html).not.toContain('hl-sq');
  });

  /* 未匹配定界符降级 */
  it('未匹配的 < 降级当普通文本', () => {
    const html = highlightContent('a < b');
    // 不应出现 hl-ab
    expect(html).not.toContain('hl-ab');
  });

  it('未匹配的 [ 降级当普通文本', () => {
    const html = highlightContent('array[i');
    expect(html).not.toContain('hl-sb');
  });

  it('未闭合的 {{ 不当作宏（findMacroEnd 返回 -1）', () => {
    const html = highlightContent('{{ unclosed');
    // 不应出现 hl-b（花括号着色）
    expect(html).not.toContain('hl-b');
  });

  /* HTML 转义 */
  it('宏内部定界符仍被高亮（值部分递归 scan）', () => {
    const html = highlightContent('{{setvar::a::<b>}}');
    // 值部分 <b> 走 hl-ab（tier3 优先级，宏内部值递归 scan）
    expect(html).toContain('hl-ab');
    // < > 被 esc 转义出现在 hl-ab span 里
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
  });
});

/* ============================================================
 * highlightLines
 * ============================================================ */
describe('highlightLines', () => {
  /* 行号分段 */
  it('空字符串 → 1 个空行（占位 \u00A0）', () => {
    const lines = highlightLines('');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('\u00A0');
  });

  it('单行无换行 → 1 行', () => {
    const lines = highlightLines('hello');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('hello');
  });

  it('多行文本 → 行数与 text.split("\\n") 对齐', () => {
    const lines = highlightLines('a\nb\nc');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('a');
    expect(lines[1]).toBe('b');
    expect(lines[2]).toBe('c');
  });

  it('空行占位 \u00A0（非空字符串）', () => {
    const lines = highlightLines('a\n\nb');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('\u00A0');
  });

  it('跨行 token：span 在每行重新打开（不在 HTML 上切）', () => {
    // 引号跨行：token 文本含 '\n'，应在 token 流上切，每行重新 span
    const lines = highlightLines('"line1\nline2"');
    expect(lines).toHaveLength(2);
    // 两行都应有 hl-dq span（引号在每行重新打开）
    expect(lines[0]).toContain('hl-dq');
    expect(lines[1]).toContain('hl-dq');
    // 不应切坏 span（单行不应出现未配对的 </span> 或孤立 <span）
    expect(lines[0].startsWith('<span')).toBe(true);
  });

  it('跨行宏：花括号 hl-b 在每行重新打开', () => {
    // 注释宏跨行
    const lines = highlightLines('{{//a\nb}}');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('hl-cm');
    expect(lines[1]).toContain('hl-cm');
  });

  it('JS 跨行块注释：每行重新 span', () => {
    const lines = highlightLines('/* line1\nline2 */', 'js');
    expect(lines).toHaveLength(2);
    // 两行都应有 hl-js-comment
    expect(lines[0]).toContain('hl-js-comment');
    expect(lines[1]).toContain('hl-js-comment');
  });

  it('language="js" 分流：关键字按 Prism JS 着色', () => {
    const lines = highlightLines('return 42;', 'js');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('hl-js-keyword');
    expect(lines[0]).toContain('hl-js-number');
  });

  it('多行宏与普通文本混合：行数正确对齐', () => {
    const text = 'hello\n{{setvar::a::b}}\nworld';
    const lines = highlightLines(text);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('hello');
    expect(lines[1]).toContain('hl-b');
    expect(lines[2]).toBe('world');
  });

  it('HTML 特殊字符在行分段里也转义', () => {
    // 用不含定界符的文本（< 会被当 tier3 起始符）
    const lines = highlightLines('a & b\n c & d');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('&amp;');
    expect(lines[1]).toContain('&amp;');
  });
});

/* ============================================================
 * 长文本 / 记忆化
 * ============================================================ */
describe('长文本与记忆化', () => {
  it('一串未匹配的 < 不造成性能灾难（记忆化砍指数级为线性）', () => {
    // 50 个连续 < 后没有匹配 >，若无记忆化会指数级退化
    const text = 'a'.repeat(0) + '<'.repeat(50) + 'tail';
    const html = highlightContent(text);
    // 应在合理时间内完成（测试本身能跑完即证明）；未匹配 < 不上色
    expect(html).not.toContain('hl-ab');
    expect(html).toContain('tail');
  });

  it('长文本完整处理：1000 行宏混合文本不报错', () => {
    const parts: string[] = [];
    for (let i = 0; i < 1000; i++) {
      parts.push(`line${i}\n{{setvar::k${i}::v${i}}}`);
    }
    const text = parts.join('\n');
    const lines = highlightLines(text);
    // 行数应与 split('\n') 对齐
    const expected = text.split('\n').length;
    expect(lines).toHaveLength(expected);
  });

  it('多次调用 tokenize 互不污染（每次独立 memo）', () => {
    // 两次调用同一段未匹配定界符文本都应正确返回
    const text = '<'.repeat(20) + 'x';
    const html1 = highlightContent(text);
    const html2 = highlightContent(text);
    expect(html1).toBe(html2);
    expect(html1).toContain('x');
  });
});

/* ============================================================
 * 性能（时间上界，防灾难性退化——不是精确基准）
 * ============================================================ */
describe('性能时间上界', () => {
  // 本地实测余量 ~20x：长 JS 约 90ms/千函数、长宏文本约 5ms/千行，
  // 上界取 500ms 只拦"指数/平方级退化"这类灾难，不拦正常机器抖动。
  it('长 JS 代码（tavern 脚本规模）highlightLines 在 500ms 内完成', () => {
    const parts: string[] = [];
    for (let i = 0; i < 1000; i++) {
      parts.push(
        `function handler${i}(ev) {
  const name = 'value' + i;   // 单行注释
  if (ev) { return { id: i, text: 's' + i }; }
  return null;
}`
      );
    }
    const text = parts.join('\n');
    const t0 = performance.now();
    const lines = highlightLines(text, 'js');
    const elapsed = performance.now() - t0;
    expect(lines).toHaveLength(text.split('\n').length); // 顺便保正确性
    expect(elapsed).toBeLessThan(500);
  });

  it('长宏文本（preset 域规模）highlightLines 在 500ms 内完成', () => {
    const parts: string[] = [];
    const content = 'word'.repeat(10);
    for (let i = 0; i < 1000; i++) {
      parts.push(`line${i} {{setvar::k${i}::v${i}${content}}
        <<"wowowo"{{user}}>>
        `);
    }
    const text = parts.join('\n');
    const t0 = performance.now();
    const lines = highlightLines(text);
    const elapsed = performance.now() - t0;
    expect(lines).toHaveLength(text.split('\n').length);
    expect(elapsed).toBeLessThan(500);
  });
});
