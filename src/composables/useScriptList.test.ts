import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useScriptList } from './useScriptList';
import type { Script } from '../types';

/** 构造最小可测脚本对象 */
function makeScript(id: string): Script {
  return {
    type: 'script',
    enabled: true,
    name: 'n',
    id,
    content: '',
    info: '',
    button: { enabled: false, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  };
}

function makeOptions(_scriptsRef: ReturnType<typeof ref<Script[] | null>>) {
  return {
    idPrefix: 'test_',
    createScript: (id: string) => makeScript(id),
    markDirty: vi.fn(),
    showToast: vi.fn(),
    t: (key: string) => key,
    loadFirstMessageKey: 'test.loadFirst',
  };
}

describe('useScriptList - genId 唯一性', () => {
  it('id 含 idPrefix 前缀', () => {
    const scriptsRef = ref<Script[]>([]);
    const u = useScriptList(() => scriptsRef.value, makeOptions(scriptsRef));
    const id = u.add();
    expect(id?.startsWith('test_')).toBe(true);
  });

  it('多次 add 生成不同 id', () => {
    const scriptsRef = ref<Script[]>([]);
    const u = useScriptList(() => scriptsRef.value, makeOptions(scriptsRef));
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(u.add()!);
    expect(ids.size).toBe(50);
  });

  it('不同 idPrefix 的 add 不会撞', () => {
    const scriptsRef1 = ref<Script[]>([]);
    const scriptsRef2 = ref<Script[]>([]);
    const o1 = makeOptions(scriptsRef1);
    const o2 = makeOptions(scriptsRef2);
    o2.idPrefix = 'other_';
    const u1 = useScriptList(() => scriptsRef1.value, o1);
    const u2 = useScriptList(() => scriptsRef2.value, o2);
    expect(u1.add()?.startsWith('test_')).toBe(true);
    expect(u2.add()?.startsWith('other_')).toBe(true);
  });
});

describe('useScriptList - add', () => {
  it('未加载（null）时 showToast 并返回 null', () => {
    const opts = makeOptions(ref<Script[]>([]));
    const u = useScriptList(() => null, opts);
    const id = u.add();
    expect(id).toBeNull();
    expect(opts.showToast).toHaveBeenCalledWith('test.loadFirst');
    expect(opts.markDirty).not.toHaveBeenCalled();
  });

  it('undefined 同 null 行为', () => {
    const opts = makeOptions(ref<Script[]>([]));
    const u = useScriptList(() => undefined, opts);
    expect(u.add()).toBeNull();
    expect(opts.showToast).toHaveBeenCalledTimes(1);
  });

  it('空数组 truthy 时正常 push', () => {
    const scriptsRef = ref<Script[]>([]);
    const opts = makeOptions(scriptsRef);
    const u = useScriptList(() => scriptsRef.value, opts);
    const id = u.add();
    expect(id).not.toBeNull();
    expect(scriptsRef.value.length).toBe(1);
    expect(scriptsRef.value[0].id).toBe(id);
    expect(opts.markDirty).toHaveBeenCalledOnce();
  });

  it('连续 add 多项', () => {
    const scriptsRef = ref<Script[]>([]);
    const u = useScriptList(() => scriptsRef.value, makeOptions(scriptsRef));
    u.add();
    u.add();
    u.add();
    expect(scriptsRef.value.length).toBe(3);
  });

  it('loadFirstMessageKey 默认值', () => {
    const scriptsRef = ref<Script[]>([]);
    const opts = makeOptions(scriptsRef);
    opts.loadFirstMessageKey = '';
    const u = useScriptList(() => null, opts);
    u.add();
    expect(opts.showToast).toHaveBeenCalledWith('preset.toast.loadFirst');
  });
});

describe('useScriptList - remove', () => {
  it('未加载时静默 return', () => {
    const opts = makeOptions(ref<Script[]>([]));
    const u = useScriptList(() => null, opts);
    u.remove('x');
    expect(opts.markDirty).not.toHaveBeenCalled();
    expect(opts.showToast).not.toHaveBeenCalled();
  });

  it('找到时 splice + markDirty', () => {
    const scriptsRef = ref<Script[]>([makeScript('a'), makeScript('b')]);
    const opts = makeOptions(scriptsRef);
    const u = useScriptList(() => scriptsRef.value, opts);
    u.remove('a');
    expect(scriptsRef.value.length).toBe(1);
    expect(scriptsRef.value[0].id).toBe('b');
    expect(opts.markDirty).toHaveBeenCalledOnce();
  });

  it('找不到时静默 no-op', () => {
    const scriptsRef = ref<Script[]>([makeScript('a')]);
    const opts = makeOptions(scriptsRef);
    const u = useScriptList(() => scriptsRef.value, opts);
    u.remove('no-such');
    expect(scriptsRef.value.length).toBe(1);
    expect(opts.markDirty).not.toHaveBeenCalled();
  });

  it('空数组 remove 不报错', () => {
    const scriptsRef = ref<Script[]>([]);
    const u = useScriptList(() => scriptsRef.value, makeOptions(scriptsRef));
    u.remove('x');
    expect(scriptsRef.value.length).toBe(0);
  });
});

describe('useScriptList - reorder', () => {
  function setup(items: string[]) {
    const scriptsRef = ref<Script[]>(items.map(makeScript));
    const opts = makeOptions(scriptsRef);
    return { scriptsRef, opts, u: useScriptList(() => scriptsRef.value, opts) };
  }

  it('从 0 移到 2 (向后, after=true)', () => {
    const { scriptsRef, opts, u } = setup(['a', 'b', 'c']);
    u.reorder(0, 2, true);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(opts.markDirty).toHaveBeenCalledOnce();
  });

  it('从 2 移到 0 (向前, after=false)', () => {
    const { scriptsRef, u } = setup(['a', 'b', 'c']);
    u.reorder(2, 0, false);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('从 2 移到 0 (向前, after=true → 插到 toIdx+1)', () => {
    const { scriptsRef, u } = setup(['a', 'b', 'c']);
    u.reorder(2, 0, true);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('单元素列表 reorder 等价原位', () => {
    const { scriptsRef, u } = setup(['a']);
    u.reorder(0, 0, true);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['a']);
  });

  it('空列表 reorder 不触碰 splice', () => {
    const { scriptsRef, opts, u } = setup([]);
    u.reorder(0, 0, true);
    expect(scriptsRef.value.length).toBe(0);
    expect(opts.markDirty).not.toHaveBeenCalled();
  });

  it('负下标守卫', () => {
    const { scriptsRef, opts, u } = setup(['a', 'b']);
    u.reorder(-1, 1, true);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['a', 'b']);
    expect(opts.markDirty).not.toHaveBeenCalled();
  });

  it('越界（>= length）守卫', () => {
    const { scriptsRef, opts, u } = setup(['a', 'b']);
    u.reorder(0, 99, true);
    expect(scriptsRef.value.map((s) => s.id)).toEqual(['a', 'b']);
    expect(opts.markDirty).not.toHaveBeenCalled();
  });

  it('scripts null 时 return', () => {
    const opts = makeOptions(ref<Script[]>([]));
    const u = useScriptList(() => null, opts);
    u.reorder(0, 0, true);
    expect(opts.markDirty).not.toHaveBeenCalled();
  });
});
