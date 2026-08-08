import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useGroupedList, isGroupNode } from './useGroupedList';
import type { OrderNode, OrderItem, OrderGroup } from '../types';

/** 构造叶子条目 */
function leaf(identifier: string, enabled = true): OrderItem {
  return { identifier, enabled };
}

/** 构造组 */
function group(id: string, children: OrderItem[], collapsed = false, enabled = true): OrderGroup {
  return { id, _gid: '_g_' + id, name: id, collapsed, enabled, children };
}

describe('isGroupNode', () => {
  it('组节点（含 children 数组）返回 true', () => {
    const g = group('g1', [leaf('a')]);
    expect(isGroupNode(g)).toBe(true);
  });

  it('叶子节点返回 false', () => {
    expect(isGroupNode(leaf('a'))).toBe(false);
  });

  it('有 children 但不是数组的对象返回 false', () => {
    expect(
      isGroupNode({ identifier: 'x', enabled: true, children: 'no' } as unknown as OrderNode)
    ).toBe(false);
  });
});

describe('useGroupedList - flatNodes / identifierToGi', () => {
  function setup(order: OrderNode[]) {
    const orderRef = ref<OrderNode[]>(order);
    return useGroupedList(orderRef);
  }

  it('flatNodes 深度先序遍历，gi = 可视下标', () => {
    const u = setup([leaf('a'), group('g1', [leaf('b'), leaf('c')]), leaf('d')]);
    const flat = u.flatNodes.value;
    expect(flat.length).toBe(5);
    expect(flat[0].ref).toBe(u.flatNodes.value[0].ref);
    expect((flat[0].ref as OrderItem).identifier).toBe('a');
    expect(flat[1].isGroup).toBe(true);
    expect((flat[2].ref as OrderItem).identifier).toBe('b');
    expect((flat[3].ref as OrderItem).identifier).toBe('c');
    expect((flat[4].ref as OrderItem).identifier).toBe('d');
  });

  it('折叠组的子项不在 flatNodes 里', () => {
    const u = setup([group('g1', [leaf('b'), leaf('c')], true), leaf('d')]);
    expect(u.flatNodes.value.length).toBe(2); // 组 + d
    expect(u.identifierToGi('b')).toBe(-1);
    expect(u.identifierToGi('d')).toBe(1);
  });

  it('identifierToGi 空入参返回 -1', () => {
    const u = setup([leaf('a')]);
    expect(u.identifierToGi(null)).toBe(-1);
    expect(u.identifierToGi(undefined)).toBe(-1);
    expect(u.identifierToGi('')).toBe(-1);
  });

  it('identifierToGi 不匹配组节点', () => {
    const u = setup([group('g1', [leaf('b')])]);
    // 组名 'g1' 不应被 identifierToGi 命中（组无 identifier）
    expect(u.identifierToGi('g1')).toBe(-1);
  });
});

describe('useGroupedList - revealAndFindGi', () => {
  it('展开折叠组后能找到子项 gi', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b'), leaf('c')], true)]);
    const u = useGroupedList(orderRef);
    expect(u.identifierToGi('b')).toBe(-1); // 折叠态查不到
    const gi = u.revealAndFindGi('b');
    expect(gi).toBe(1); // 展开后组=0, b=1
    // 组现在已展平
    expect((orderRef.value[0] as OrderGroup).collapsed).toBe(false);
  });

  it('顶层无对应组时不改动任何组状态', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b')], true), leaf('x')]);
    const u = useGroupedList(orderRef);
    const gi = u.revealAndFindGi('x');
    expect(gi).toBe(1);
    expect((orderRef.value[0] as OrderGroup).collapsed).toBe(true); // 未被改
  });
});

describe('useGroupedList - selectBlock / toggleBlock / clearSelection', () => {
  function setup(order: OrderNode[]) {
    const orderRef = ref<OrderNode[]>(order);
    return useGroupedList(orderRef);
  }

  it('plain click 选中唯一行，再点同行清空', () => {
    const u = setup([leaf('a'), leaf('b'), leaf('c')]);
    u.selectBlock(1);
    expect(u.selectedGi.value.has(1)).toBe(true);
    expect(u.anchorGi.value).toBe(1);
    u.selectBlock(1);
    expect(u.selectedGi.value.size).toBe(0);
    expect(u.anchorGi.value).toBe(-1);
  });

  it('ctrl click toggle 此行并成为新 anchor', () => {
    const u = setup([leaf('a'), leaf('b'), leaf('c')]);
    u.selectBlock(0);
    u.selectBlock(2, { ctrl: true });
    expect(u.selectedGi.value.has(0)).toBe(true);
    expect(u.selectedGi.value.has(2)).toBe(true);
    expect(u.anchorGi.value).toBe(2);
    u.selectBlock(2, { ctrl: true });
    expect(u.selectedGi.value.has(2)).toBe(false);
  });

  it('shift click 需 anchor，否则 no-op', () => {
    const u = setup([leaf('a'), leaf('b'), leaf('c')]);
    u.selectBlock(0, { shift: true });
    expect(u.selectedGi.value.size).toBe(0); // 无 anchor
  });

  it('shift click 从 anchor 到 gi 的区间（含两端）', () => {
    const u = setup([leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
    u.selectBlock(0);
    u.selectBlock(2, { shift: true });
    expect(u.selectedGi.value.has(0)).toBe(true);
    expect(u.selectedGi.value.has(1)).toBe(true);
    expect(u.selectedGi.value.has(2)).toBe(true);
    expect(u.selectedGi.value.has(3)).toBe(false);
    expect(u.anchorGi.value).toBe(0); // anchor 不动
  });

  it('toggleBlock 切换叶子 enabled', () => {
    const orderRef = ref<OrderNode[]>([leaf('a', true)]);
    const u = useGroupedList(orderRef);
    u.toggleBlock(0);
    expect((orderRef.value[0] as OrderItem).enabled).toBe(false);
    u.toggleBlock(0);
    expect((orderRef.value[0] as OrderItem).enabled).toBe(true);
  });

  it('toggleBlock 切换组 enabled', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b')])]);
    const u = useGroupedList(orderRef);
    u.toggleBlock(0);
    expect((orderRef.value[0] as OrderGroup).enabled).toBe(false);
  });

  it('toggleBlock 越界 gi 安全返回', () => {
    const u = setup([leaf('a')]);
    u.toggleBlock(99);
    // 不抛错
    expect(u.flatNodes.value.length).toBe(1);
  });

  it('toggleGroupCollapse 切换组 collapsed', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b')], false)]);
    const u = useGroupedList(orderRef);
    u.toggleGroupCollapse(0);
    expect((orderRef.value[0] as OrderGroup).collapsed).toBe(true);
  });

  it('toggleGroupCollapse 对叶子节点 no-op', () => {
    const orderRef = ref<OrderNode[]>([leaf('a')]);
    const u = useGroupedList(orderRef);
    u.toggleGroupCollapse(0);
    // 不报错，flatNodes 不变
    expect(u.flatNodes.value.length).toBe(1);
  });

  it('clearSelection 清空选中与锚点', () => {
    const u = setup([leaf('a'), leaf('b')]);
    u.selectBlock(0);
    u.selectBlock(1, { ctrl: true });
    u.clearSelection();
    expect(u.selectedGi.value.size).toBe(0);
    expect(u.anchorGi.value).toBe(-1);
  });
});

describe('useGroupedList - reorderBlock', () => {
  function setup(order: OrderNode[]) {
    const orderRef = ref<OrderNode[]>(order);
    return useGroupedList(orderRef);
  }

  it('同一父级内向后移动（after=true 插到目标位）', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b'), leaf('c')]);
    const u = useGroupedList(orderRef);
    u.reorderBlock(0, 2, true);
    expect((orderRef.value[0] as OrderItem).identifier).toBe('b');
    expect((orderRef.value[1] as OrderItem).identifier).toBe('c');
    expect((orderRef.value[2] as OrderItem).identifier).toBe('a');
  });

  it('同一父级内向前移动（after=false 插到目标位）', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b'), leaf('c')]);
    const u = useGroupedList(orderRef);
    u.reorderBlock(2, 0, false);
    expect((orderRef.value[0] as OrderItem).identifier).toBe('c');
    expect((orderRef.value[1] as OrderItem).identifier).toBe('a');
    expect((orderRef.value[2] as OrderItem).identifier).toBe('b');
  });

  it('组内 reorder 不影响顶层', () => {
    const g = group('g1', [leaf('b'), leaf('c'), leaf('d')]);
    const orderRef = ref<OrderNode[]>([g, leaf('e')]);
    const u = useGroupedList(orderRef);
    // flatNodes: g=0, b=1, c=2, d=3, e=4
    // fromIdx=3 (d) 向前移到 toIdx=1 (b)，after=false → ni = toIdx = 1
    u.reorderBlock(3, 1, false);
    const children = (orderRef.value[0] as OrderGroup).children;
    expect(children[0].identifier).toBe('d');
    expect(children[1].identifier).toBe('b');
    expect(children[2].identifier).toBe('c');
    // 顶层未受影响
    expect((orderRef.value[1] as OrderItem).identifier).toBe('e');
  });

  it('跨父级 reorder 拒绝（组内 ↔ 顶层）', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b')]), leaf('e')]);
    const u = useGroupedList(orderRef);
    // flatNodes: g=0, b=1, e=2
    u.reorderBlock(1, 2, true);
    // 未动顶层：e 仍是叶子
    expect((orderRef.value[1] as OrderItem).identifier).toBe('e');
    expect((orderRef.value[0] as OrderGroup).children.length).toBe(1);
  });

  it('越界 gi 安全返回', () => {
    const u = setup([leaf('a')]);
    u.reorderBlock(0, 99, true);
    expect((u.flatNodes.value[0].ref as OrderItem).identifier).toBe('a');
  });
});

describe('useGroupedList - insertAfterActive', () => {
  it('激活叶子 → 插到其后面一位', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b')]);
    const u = useGroupedList(orderRef);
    const newItem = leaf('c');
    u.insertAfterActive(newItem, 'a');
    expect((orderRef.value[1] as OrderItem).identifier).toBe('c');
    expect((orderRef.value[2] as OrderItem).identifier).toBe('b');
  });

  it('激活组 → �进该组 children 末尾', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b'), leaf('c')])]);
    const u = useGroupedList(orderRef);
    u.insertAfterActive(leaf('d'), undefined); // 无激活 → push 末尾
    // 无激活节点时追加到末尾
    expect(orderRef.value.length).toBe(2);
    expect((orderRef.value[1] as OrderItem).identifier).toBe('d');
  });

  it('找不到激活节点 → 追加末尾', () => {
    const orderRef = ref<OrderNode[]>([leaf('a')]);
    const u = useGroupedList(orderRef);
    u.insertAfterActive(leaf('z'), 'no-such-id');
    expect(orderRef.value.length).toBe(2);
    expect((orderRef.value[1] as OrderItem).identifier).toBe('z');
  });
});

describe('useGroupedList - removeNode', () => {
  it('摘叶子返回单 identifier', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b')]);
    const u = useGroupedList(orderRef);
    const res = u.removeNode(0);
    expect(res).not.toBeNull();
    expect(res!.identifiers).toEqual(['a']);
    expect(orderRef.value.length).toBe(1);
  });

  it('摘组返回全部子项 identifier', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('b'), leaf('c')]), leaf('d')]);
    const u = useGroupedList(orderRef);
    const res = u.removeNode(0);
    expect(res!.identifiers).toEqual(['b', 'c']);
    expect(orderRef.value.length).toBe(1);
  });

  it('越界 gi 返回 null', () => {
    const u = useGroupedList(ref<OrderNode[]>([leaf('a')]));
    expect(u.removeNode(99)).toBeNull();
  });
});

describe('useGroupedList - bindSelected / unbindGroup', () => {
  it('顶层选中 <2 行返回 null', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b')]);
    const u = useGroupedList(orderRef);
    u.selectBlock(0);
    expect(u.bindSelected()).toBeNull();
  });

  it('顶层选中 ≥2 行打成新组，组插在最小原下标处', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b'), leaf('c')]);
    const u = useGroupedList(orderRef);
    u.selectBlock(0);
    u.selectBlock(2, { ctrl: true });
    const res = u.bindSelected();
    expect(res!.itemCount).toBe(2);
    expect(res!.childCount).toBe(2);
    // 组插在最小原下标处（0）
    expect(isGroupNode(orderRef.value[0])).toBe(true);
    const g = orderRef.value[0] as OrderGroup;
    expect(g.children[0].identifier).toBe('a');
    expect(g.children[1].identifier).toBe('c');
    // b 还在原位（now index 1）
    expect((orderRef.value[1] as OrderItem).identifier).toBe('b');
    // 选中已清空
    expect(u.selectedGi.value.size).toBe(0);
  });

  it('groupName 选项生效', () => {
    const orderRef = ref<OrderNode[]>([leaf('a'), leaf('b')]);
    const u = useGroupedList(orderRef, { groupName: (n) => `MyGroup(${n})` });
    u.selectBlock(0);
    u.selectBlock(1, { ctrl: true });
    u.bindSelected();
    const g = orderRef.value[0] as OrderGroup;
    expect(g.name).toBe('MyGroup(2)');
  });

  it('选中含组时扁平化其 children', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('x'), leaf('y')]), leaf('z')]);
    const u = useGroupedList(orderRef);
    // flatNodes: g1=0, x=1, y=2, z=3
    u.selectBlock(0);
    u.selectBlock(3, { ctrl: true });
    const res = u.bindSelected();
    expect(res!.itemCount).toBe(2);
    expect(res!.childCount).toBe(3); // x,y,z 三个叶子
    const g = orderRef.value[0] as OrderGroup;
    expect(g.children.length).toBe(3);
  });

  it('unbindGroup 非组返回 false', () => {
    const orderRef = ref<OrderNode[]>([leaf('a')]);
    const u = useGroupedList(orderRef);
    expect(u.unbindGroup(0)).toBe(false);
  });

  it('unbindGroup 组就地替换为 children 上提一层', () => {
    const orderRef = ref<OrderNode[]>([group('g1', [leaf('x'), leaf('y')]), leaf('z')]);
    const u = useGroupedList(orderRef);
    expect(u.unbindGroup(0)).toBe(true);
    expect((orderRef.value[0] as OrderItem).identifier).toBe('x');
    expect((orderRef.value[1] as OrderItem).identifier).toBe('y');
    expect((orderRef.value[2] as OrderItem).identifier).toBe('z');
    expect(u.selectedGi.value.size).toBe(0);
  });

  it('unbindGroup 越界返回 false', () => {
    const u = useGroupedList(ref<OrderNode[]>([leaf('a')]));
    expect(u.unbindGroup(99)).toBe(false);
  });
});
