/* order 分组树的折叠无关遍历/删除原语。
 *
 * order 树是"干净数组 + _gid 分组字段"派生的运行时视图（2 层：顶层 OrderItem|OrderGroup，
 * 组内是 OrderItem[]，不嵌套）。这里提供的展平/删除是 agent 侧的折叠无关序列——遍历始终下钻进
 * 组的 children，不读 `collapsed`（collapsed 只影响 UI 是否显示，不影响 agent 的"第几个"语义）。
 */
import type { OrderNode, OrderGroup } from '../../types';

export function isGroup(node: OrderNode): node is OrderGroup {
  return 'children' in node && Array.isArray(node.children);
}

/** 折叠无关的深度优先展平：返回 identifier 序列（组边界忽略、折叠态忽略）。 */
export function flattenOrderIds(order: OrderNode[]): string[] {
  const ids: string[] = [];
  for (const node of order) {
    if (isGroup(node)) {
      for (const child of node.children) ids.push(child.identifier);
    } else {
      ids.push(node.identifier);
    }
  }
  return ids;
}

/** 从 order 树移除某 identifier；组内子项被删空则连组一起删。返回新树（不改入参）。 */
export function removeIdentifierFromOrder(order: OrderNode[], id: string): OrderNode[] {
  const out: OrderNode[] = [];
  for (const node of order) {
    if (isGroup(node)) {
      const children = node.children.filter((c) => c.identifier !== id);
      if (children.length > 0) out.push({ ...node, children });
    } else if (node.identifier !== id) {
      out.push(node);
    }
  }
  return out;
}
