import { describe, it, expect } from 'vitest';
import { esc, span, escRe } from './display';

// ===== esc / span / escRe =====

describe('esc', () => {
  it('转义 & 为 &amp;', () => {
    expect(esc('a&b')).toBe('a&amp;b');
  });
  it('转义 < 为 &lt;', () => {
    expect(esc('a<b')).toBe('a&lt;b');
  });
  it('转义 > 为 &gt;', () => {
    expect(esc('a>b')).toBe('a&gt;b');
  });
  it('转义 " 为 &quot;', () => {
    expect(esc('a"b')).toBe('a&quot;b');
  });
  it('& 先转避免二次转义', () => {
    expect(esc('<&')).toBe('&lt;&amp;');
  });
  it('不转义单引号', () => {
    expect(esc("a'b")).toBe("a'b");
  });
  it('全部混合按顺序转义', () => {
    expect(esc('a<b>"&c')).toBe('a&lt;b&gt;&quot;&amp;c');
  });
  it('空串返回空串', () => {
    expect(esc('')).toBe('');
  });
});

describe('span', () => {
  it('拼 span class 包装', () => {
    expect(span('hl', 'inner')).toBe('<span class="hl">inner</span>');
  });
  it('空 class', () => {
    expect(span('', 'x')).toBe('<span class="">x</span>');
  });
});

describe('escRe', () => {
  it('转义正则元字符 . * + ? ^ $ {} () | [] \\', () => {
    expect(escRe('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(
      'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o'
    );
  });
  it('普通字母数字不转义', () => {
    expect(escRe('abc123')).toBe('abc123');
  });
  it('空串返回空串', () => {
    expect(escRe('')).toBe('');
  });
});
