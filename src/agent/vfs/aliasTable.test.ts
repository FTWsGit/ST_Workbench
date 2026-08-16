import { describe, it, expect } from 'vitest';
import { AliasTable } from './aliasTable';

describe('AliasTable', () => {
  it('assigns sequential aliases on first register', () => {
    const t = new AliasTable();
    const m = t.register('preset:prompts', ['a', 'b', 'c']);
    expect([...m.values()]).toEqual(['1', '2', '3']);
    expect([...m.keys()]).toEqual(['a', 'b', 'c']);
  });

  it('keeps alias stable across re-register and reorder', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a', 'b', 'c']);
    // 重排后再 register：真实 id 顺序变了，alias 不漂移
    const m = t.register('preset:prompts', ['c', 'a', 'b']);
    expect(m.get('a')).toBe('1');
    expect(m.get('b')).toBe('2');
    expect(m.get('c')).toBe('3');
  });

  it('registers new ids with the next alias without shifting existing', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a']);
    const m = t.register('preset:prompts', ['a', 'b']);
    expect(m.get('a')).toBe('1');
    expect(m.get('b')).toBe('2');
  });

  it('resolves alias back to real id', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a']);
    expect(t.resolve('preset:prompts', '1')).toBe('a');
    expect(t.resolve('preset:prompts', '2')).toBeUndefined();
  });

  it('retires alias permanently, never reuses the number', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a', 'b']);
    t.retire('preset:prompts', 'a');
    expect(t.resolve('preset:prompts', '1')).toBeUndefined();
    // 新 id 进来，别名继续往后数，不复用 1
    const m = t.register('preset:prompts', ['b', 'c']);
    expect(m.get('c')).toBe('3');
    expect(t.resolve('preset:prompts', '1')).toBeUndefined();
  });

  it('isolates collections', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a']);
    t.register('preset:regexs', ['x']);
    expect(t.resolve('preset:prompts', '1')).toBe('a');
    expect(t.resolve('preset:regexs', '1')).toBe('x');
  });

  it('reset clears everything including counter', () => {
    const t = new AliasTable();
    t.register('preset:prompts', ['a']);
    t.reset();
    expect(t.resolve('preset:prompts', '1')).toBeUndefined();
    const m = t.register('preset:prompts', ['a']);
    expect(m.get('a')).toBe('1');
  });
});
