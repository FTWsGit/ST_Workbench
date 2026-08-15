import { describe, it, expect } from 'vitest';
import { findMacroEnd, stripMacros } from './macroText';

// ===== findMacroEnd / stripMacros =====

describe('findMacroEnd', () => {
  it('{{x}} → 返回闭合 }} 之后那个 index', () => {
    expect(findMacroEnd('{{x}}', 0)).toBe('{{x}}'.length);
  });
  it('start 指向 {{ 起始，从 start+2 开始扫描', () => {
    const text = 'ab{{cd}}ef';
    expect(findMacroEnd(text, 2)).toBe(8);
  });
  it('嵌套 {{...{{...}}...}} → depth 正确', () => {
    const text = '{{a{{b}}c}}';
    expect(findMacroEnd(text, 0)).toBe(text.length);
  });
  it('未闭合 → 返回 -1', () => {
    expect(findMacroEnd('{{abc', 0)).toBe(-1);
  });
  it('闭合后再多余字符不影响（返回 }} 之后 index）', () => {
    // {{x}}tail: }} at idx 3-4, returns j=5
    expect(findMacroEnd('{{x}}tail', 0)).toBe(5);
  });
  it('单 } 不闭合（需 }}）', () => {
    // text = '{{a}b}}' → j=2 走 'a'(j=3), '}' 单字符（j=4）, 然后到串尾 depth=1 → -1
    // 但 text '{{a}}' → '} } ' 是 } + } → depth--
    expect(findMacroEnd('{{a}b}}', 0)).toBe('{{a}b}}'.length);
  });
});

describe('stripMacros', () => {
  it('整体移除每个 {{...}} macro span', () => {
    expect(stripMacros('ab{{x}}cd')).toBe('abcd');
  });
  it('多个 macro 全移除', () => {
    expect(stripMacros('{{a}}b{{c}}d')).toBe('bd');
  });
  it('未闭合的 {{ 视为普通文本保留', () => {
    expect(stripMacros('{{abc')).toBe('{{abc');
  });
  it('嵌套 macro 整段丢弃', () => {
    expect(stripMacros('{{a{{b}}c}}')).toBe('');
  });
  it('无 macro → 原文', () => {
    expect(stripMacros('hello')).toBe('hello');
  });
  it('空串 → 空串', () => {
    expect(stripMacros('')).toBe('');
  });
  it('macro 紧贴首尾', () => {
    expect(stripMacros('{{x}}tail')).toBe('tail');
    expect(stripMacros('head{{x}}')).toBe('head');
  });
});
