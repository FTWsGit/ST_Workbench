import { describe, it, expect } from 'vitest';
import { useItemDirty } from './useItemDirty';

describe('useItemDirty', () => {
  it('markDirty 记录脏状态并驱动 anyDirty', () => {
    const tracker = useItemDirty<{ x: number }>();

    tracker.markDirty('a');

    expect(tracker.isDirty('a')).toBe(true);
    expect(tracker.anyDirty.value).toBe(true);
    expect(tracker.isNew('a')).toBe(true);
  });

  it('setBaseline 登记基线并清脏', () => {
    const tracker = useItemDirty<{ x: number }>();
    const obj = { x: 1 };

    tracker.setBaseline('a', obj);

    expect(tracker.isDirty('a')).toBe(false);
    expect(tracker.isNew('a')).toBe(false);
    expect(tracker.getBaseline('a')).toEqual(obj);
  });

  it('discard 返回基线深拷贝并清脏', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.setBaseline('a', { x: 1 });
    tracker.markDirty('a');

    const restored = tracker.discard('a');

    expect(restored).toEqual({ x: 1 });
    expect(tracker.isDirty('a')).toBe(false);

    // 返回值是深拷贝：改动它不影响后续 getBaseline。
    restored!.x = 999;
    expect(tracker.getBaseline('a')).toEqual({ x: 1 });
  });

  it('discard 对新建 item 返回 undefined 并清脏', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.markDirty('a');

    const restored = tracker.discard('a');

    expect(restored).toBeUndefined();
    expect(tracker.isDirty('a')).toBe(false);
  });

  it('syncFromValues 全量重算脏状态', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.resetAll([
      ['a', { x: 1 }],
      ['b', { x: 2 }],
    ]);

    tracker.syncFromValues([
      ['a', { x: 1 }],
      ['b', { x: 9 }],
      ['c', { x: 3 }],
    ]);

    expect(tracker.isDirty('a')).toBe(false);
    expect(tracker.isDirty('b')).toBe(true);
    expect(tracker.isDirty('c')).toBe(true);
    expect(tracker.isNew('c')).toBe(true);
  });

  it('syncFromValues 清掉已回退到基线的脏 id', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.resetAll([['a', { x: 1 }]]);

    tracker.markDirty('a');
    expect(tracker.isDirty('a')).toBe(true);

    tracker.syncFromValues([['a', { x: 1 }]]);
    expect(tracker.isDirty('a')).toBe(false);
  });

  it('syncFromValues 成员没变时保持同一引用（不整体赋值 ref）', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.resetAll([['a', { x: 1 }]]);
    const ref = tracker.dirtyIds.value;

    tracker.syncFromValues([['a', { x: 1 }]]);

    expect(tracker.dirtyIds.value).toBe(ref);
    expect(tracker.isDirty('a')).toBe(false);
  });

  it('syncFromValues 成员变化时也原地更新（引用不变）', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.resetAll([['a', { x: 1 }]]);
    const ref = tracker.dirtyIds.value;

    tracker.syncFromValues([['a', { x: 9 }]]);

    expect(tracker.dirtyIds.value).toBe(ref);
    expect(tracker.isDirty('a')).toBe(true);
  });

  it('resetAll 整体重建基线并清空脏集合', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.markDirty('a');
    tracker.markDirty('b');

    tracker.resetAll([['a', { x: 1 }]]);

    expect(tracker.anyDirty.value).toBe(false);
    expect(tracker.isDirty('a')).toBe(false);
    expect(tracker.isNew('a')).toBe(false);
    // b 的旧记录被整体清掉，回到"新建未保存"。
    expect(tracker.isNew('b')).toBe(true);
  });

  it('remove 清理基线并清脏', () => {
    const tracker = useItemDirty<{ x: number }>();
    tracker.setBaseline('a', { x: 1 });
    tracker.markDirty('a');

    tracker.remove('a');

    expect(tracker.isDirty('a')).toBe(false);
    expect(tracker.isNew('a')).toBe(true);
    expect(tracker.getBaseline('a')).toBeUndefined();
  });
});
