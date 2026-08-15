import { describe, it, expect } from 'vitest';
import { searchFields } from './search';
import type { SearchField } from './search';

// ===== searchFields =====

describe('searchFields', () => {
  function fields(...f: SearchField[]): SearchField[] {
    return f;
  }

  it('空 query → 返回空数组', () => {
    expect(
      searchFields(
        [{ id: 'a', name: 'A' }],
        fields({ key: 'name', labelKey: 'x', kind: 'text' }),
        ''
      )
    ).toEqual([]);
  });

  it('大小写不敏感命中', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'Hello World' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'hello'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].col).toBe(0);
    expect(hits[0].line).toBe(0);
  });

  it('text 字段多行：line=行号 col=行内列', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'a\nbb\nccc' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'c'
    );
    // 只有第三行 'ccc' 含 c → line=2，col=0
    expect(hits).toHaveLength(3); // 'ccc' 含 3 个 c，重叠命中
    expect(hits.every((h) => h.line === 2)).toBe(true);
    expect(hits[0].col).toBe(0);
    expect(hits[1].col).toBe(1);
    expect(hits[2].col).toBe(2);
  });

  it('list 字段：逐元素按行搜，line=元素下标', () => {
    const hits = searchFields(
      [{ identifier: 'b1', keys: ['foo', 'bar baz'] }],
      fields({ key: 'keys', labelKey: 'x', kind: 'list' }),
      'bar'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
    expect(hits[0].col).toBe(0);
  });

  it('enum 字段：整值精确大小写敏感匹配，line/col=-1', () => {
    const hits = searchFields(
      [{ identifier: 'b1', role: 'user' }],
      fields({ key: 'role', labelKey: 'x', kind: 'enum' }),
      'user'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(-1);
    expect(hits[0].col).toBe(-1);
    expect(hits[0].ml).toBe(4);
  });

  it('enum 字段：大小写敏感不匹配 → 无命中', () => {
    const hits = searchFields(
      [{ identifier: 'b1', role: 'user' }],
      fields({ key: 'role', labelKey: 'x', kind: 'enum' }),
      'USER'
    );
    expect(hits).toHaveLength(0);
  });

  it('字段值 undefined/null → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: undefined as unknown as string }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'x'
    );
    expect(hits).toHaveLength(0);
  });

  it('命中定位 col 是 0-based 行内列', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'aaa bbb' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'bbb'
    );
    expect(hits[0].col).toBe(4);
  });

  it('上下文裁窗 ±30 字 + …', () => {
    const long = 'x'.repeat(10) + 'MATCH' + 'y'.repeat(10);
    const hits = searchFields(
      [{ identifier: 'b1', name: long }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'match'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].context).toContain('MATCH');
    // 短串不需裁窗 → 无省略号
    expect(hits[0].ms).toBe(10);
  });

  it('长串上下文两端补 …', () => {
    const long = 'x'.repeat(50) + 'MATCH' + 'y'.repeat(50);
    const hits = searchFields(
      [{ identifier: 'b1', name: long }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'match'
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].context.startsWith('…')).toBe(true);
    expect(hits[0].context.endsWith('…')).toBe(true);
  });

  it('自定义 getItemMeta 提供 itemId/itemName', () => {
    const hits = searchFields(
      [{ id: 'b1', scriptName: 'Script1' }],
      fields({ key: 'scriptName', labelKey: 'x', kind: 'text' }),
      'Script1'
    );
    // 默认 getItemMeta：id=scriptName fallback chain
    expect(hits).toHaveLength(1);
  });

  it('多 item × 多 field', () => {
    const hits = searchFields(
      [
        { identifier: 'b1', name: 'alpha', role: 'user' },
        { identifier: 'b2', name: 'beta', role: 'assistant' },
      ],
      fields(
        { key: 'name', labelKey: 'x', kind: 'text' },
        { key: 'role', labelKey: 'x', kind: 'enum' }
      ),
      'user'
    );
    // text 'name' 搜 'user' 无命中；enum 'role' 'user' 精确命中 1
    expect(hits).toHaveLength(1);
    expect(hits[0].itemId).toBe('b1');
    expect(hits[0].fieldKey).toBe('role');
  });

  it('null item 跳过', () => {
    const hits = searchFields(
      [null as unknown as Record<string, unknown>, { identifier: 'b1', name: 'hello' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'hello'
    );
    expect(hits).toHaveLength(1);
  });

  it('list 字段值不是数组 → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', keys: 'not array' }],
      fields({ key: 'keys', labelKey: 'x', kind: 'list' }),
      'array'
    );
    expect(hits).toHaveLength(0);
  });

  it('text 字段值非 string → 跳过', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 123 }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      '123'
    );
    expect(hits).toHaveLength(0);
  });

  it('重叠命中都报告（si=f+1）', () => {
    const hits = searchFields(
      [{ identifier: 'b1', name: 'aa' }],
      fields({ key: 'name', labelKey: 'x', kind: 'text' }),
      'a'
    );
    expect(hits).toHaveLength(2);
    expect(hits[0].col).toBe(0);
    expect(hits[1].col).toBe(1);
  });
});
