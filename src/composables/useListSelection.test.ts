import { describe, it, expect, vi } from 'vitest';
import { useListSelection, type SelectMode } from './useListSelection';

/**
 * onClick 的多选分支：判定优先级 shiftKey > (ctrlKey || metaKey) > single。
 * 不持有选择态，只把 mode 分发给 opts.onSelect。
 */
describe('useListSelection — onClick 多选分支', () => {
  it('无任何修饰键 → single', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('a', {});
    expect(calls).toEqual([{ mode: 'single', id: 'a' }]);
  });

  it('ctrlKey=true → ctrl', () => {
    const calls: Array<{ mode: SelectMode; id: number }> = [];
    const { onClick } = useListSelection<number>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick(3, { ctrlKey: true });
    expect(calls).toEqual([{ mode: 'ctrl', id: 3 }]);
  });

  it('metaKey=true（macOS Cmd）等同 ctrl', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('x', { metaKey: true });
    expect(calls).toEqual([{ mode: 'ctrl', id: 'x' }]);
  });

  it('shiftKey=true → shift（优先级高于 ctrl/meta）', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('s', { shiftKey: true });
    expect(calls).toEqual([{ mode: 'shift', id: 's' }]);
  });

  it('shiftKey + ctrlKey 同时按下时判定为 shift（shiftKey 优先）', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('s', { shiftKey: true, ctrlKey: true });
    expect(calls[0].mode).toBe('shift');
  });

  it('single 模式原样透传给 onSelect（不做切换/状态计算）', () => {
    const onSelect = vi.fn();
    const { onClick } = useListSelection<string>({ onSelect });
    onClick('id1', {});
    expect(onSelect).toHaveBeenCalledWith('single', 'id1');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('多次点击不同 id 各独立分发，mode 仅由修饰键决定', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('1', {});
    onClick('2', { ctrlKey: true });
    onClick('3', { shiftKey: true });
    onClick('4', { metaKey: true });
    expect(calls).toEqual([
      { mode: 'single', id: '1' },
      { mode: 'ctrl', id: '2' },
      { mode: 'shift', id: '3' },
      { mode: 'ctrl', id: '4' },
    ]);
  });

  it('空对象 ClickModifiers（所有修饰键 undefined）判定为 single', () => {
    const calls: Array<{ mode: SelectMode; id: string }> = [];
    const { onClick } = useListSelection<string>({
      onSelect: (mode, id) => {
        calls.push({ mode, id });
      },
    });
    onClick('z', { ctrlKey: undefined, metaKey: undefined, shiftKey: undefined });
    expect(calls[0].mode).toBe('single');
  });
});
