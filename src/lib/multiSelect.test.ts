import { describe, it, expect } from 'vitest';
import { applyMultiSelect } from './multiSelect';

// ===== applyMultiSelect =====

describe('applyMultiSelect', () => {
  function state(
    selected: number[],
    anchor: number | null
  ): { selected: Set<number>; anchor: number | null } {
    return { selected: new Set(selected), anchor };
  }
  const all = [1, 2, 3, 4, 5];

  describe('plain click（无 ctrl/shift）', () => {
    it('选中仅此行（清空其它）', () => {
      const out = applyMultiSelect(state([3], 3), 1, all, {});
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.size).toBe(1);
      expect(out.anchor).toBe(1);
    });
    it('再点同一行（已是唯一选中）→ 清空', () => {
      const out = applyMultiSelect(state([1], 1), 1, all, {});
      expect(out.selected.size).toBe(0);
      expect(out.anchor).toBeNull();
    });
    it('多选时点某行 → 仅剩此行', () => {
      const out = applyMultiSelect(state([1, 2, 3], 1), 2, all, {});
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.size).toBe(1);
    });
  });

  describe('ctrl+click', () => {
    it('toggle 加入', () => {
      const out = applyMultiSelect(state([1], 1), 2, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.anchor).toBe(2);
    });
    it('toggle 移除', () => {
      const out = applyMultiSelect(state([1, 2], 1), 1, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(false);
      expect(out.selected.has(2)).toBe(true);
      expect(out.anchor).toBe(1);
    });
    it('从空选中加选', () => {
      const out = applyMultiSelect(state([], null), 1, all, { ctrl: true });
      expect(out.selected.has(1)).toBe(true);
    });
  });

  describe('shift+click', () => {
    it('anchor 到点击行区间全选（含两端）', () => {
      const out = applyMultiSelect(state([1], 1), 3, all, { shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.selected.size).toBe(3);
      expect(out.anchor).toBe(1);
    });
    it('anchor 在点击行之后 → 反向区间', () => {
      const out = applyMultiSelect(state([4], 4), 2, all, { shift: true });
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.selected.has(4)).toBe(true);
    });
    it('anchor === null → no-op 返回原 state', () => {
      const s = state([], null);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
    it('anchor 不在 all 中 → no-op', () => {
      const s = state([99], 99);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
    it('点击行不在 all 中 → no-op', () => {
      const s = state([1], 1);
      const out = applyMultiSelect(s, 99, all, { shift: true });
      expect(out).toBe(s);
    });
  });

  describe('混合 ctrl+shift', () => {
    it('ctrl+shift 都 true → 走 shift 分支（hasShift 优先）', () => {
      const out = applyMultiSelect(state([1], 1), 3, all, { ctrl: true, shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
      expect(out.selected.has(3)).toBe(true);
      expect(out.anchor).toBe(1);
    });
    it('shift 但无 anchor 且有 ctrl → hasShift 分支跳过 → ctrl 分支 toggle', () => {
      const out = applyMultiSelect(state([1], null), 2, all, { ctrl: true, shift: true });
      expect(out.selected.has(1)).toBe(true);
      expect(out.selected.has(2)).toBe(true);
    });
    it('shift 但无 anchor 且无 ctrl → 返回 state（no-op）', () => {
      const s = state([1], null);
      const out = applyMultiSelect(s, 2, all, { shift: true });
      expect(out).toBe(s);
    });
  });

  it('返回纯新 state 不 mutation 原 selected Set', () => {
    const s = state([1], 1);
    const out = applyMultiSelect(s, 2, all, { ctrl: true });
    expect(out.selected).not.toBe(s.selected);
    expect(s.selected.has(1)).toBe(true);
    expect(s.selected.has(2)).toBe(false);
  });
});
