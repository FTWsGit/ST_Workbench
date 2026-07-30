import { ref, computed, type Ref } from 'vue'
import type { OrderNode, OrderGroup, OrderItem, FlatNode } from '../types'
import { applyMultiSelect } from '../utils'

export function isGroupNode(node: OrderNode): node is OrderGroup {
  return 'children' in node && Array.isArray((node as any).children)
}

export interface UseGroupedListOptions {
  /** 新建组时的默认名字，参数是组里的条目数。默认 `Group (N)`。 */
  groupName?: (count: number) => string
}

/** flatNodes 构建 + 选择/折叠/绑定/拆组/重排这套"树形分组列表"机制。
 *
 * 这里只管树本身的形状（`OrderNode[]`，identifier 是唯一跟"内容是什么"沾边的字段），不知道
 * `prompts`/`tabsStore`/`confirmStore`/`markDirty`/`showToast` 的存在——这些是 domain 自己的
 * 关注点。domain-specific 操作（deleteBlock 等）不在本 composable 内，只提供 removeNode() 等
 * 纯树操作原语，返回 identifier 列表供 domain 层自行清理。 */
export function useGroupedList(order: Ref<OrderNode[]>, opts: UseGroupedListOptions = {}) {
  const selectedGi = ref<Set<number>>(new Set())
  const anchorGi = ref(-1)

  const flatNodes = computed<FlatNode[]>(() => {
    const nodes: FlatNode[] = []
    function walk(arr: OrderNode[], parent: OrderNode[], depth: number) {
      arr.forEach((nodeRef, parentIdx) => {
        const g = isGroupNode(nodeRef)
        nodes.push({ ref: nodeRef, parent, parentIdx, depth, isGroup: g })
        if (g && !nodeRef.collapsed) walk(nodeRef.children, nodeRef.children as any, depth + 1)
      })
    }
    walk(order.value, order.value, 0)
    return nodes
  })

  function identifierToGi(identifier: string | null | undefined): number {
    if (!identifier) return -1
    return flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === identifier)
  }

  /** identifier -> gi，但先自动展开包着它的折叠组，否则 flatNodes 对折叠组里的子节点返回 -1。 */
  function revealAndFindGi(identifier: string): number {
    for (const node of order.value) {
      if (isGroupNode(node) && node.collapsed && node.children.some(c => c.identifier === identifier)) {
        node.collapsed = false
        break // 一个条目只能属于一个顶层组
      }
    }
    return identifierToGi(identifier)
  }

  function clearSelection() {
    selectedGi.value = new Set()
    anchorGi.value = -1
  }

  function selectBlock(gi: number, selectOpts?: { ctrl?: boolean; shift?: boolean }) {
    const next = applyMultiSelect(
      { selected: selectedGi.value, anchor: anchorGi.value >= 0 ? anchorGi.value : null },
      gi,
      flatNodes.value.map((_, i) => i),
      selectOpts || {}
    )
    selectedGi.value = next.selected
    anchorGi.value = next.anchor ?? -1
  }

  function toggleBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    if (node.isGroup) (node.ref as OrderGroup).enabled = !(node.ref as OrderGroup).enabled
    else (node.ref as OrderItem).enabled = !(node.ref as OrderItem).enabled
  }

  function toggleGroupCollapse(gi: number) {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return
    ;(node.ref as OrderGroup).collapsed = !(node.ref as OrderGroup).collapsed
  }

  function reorderBlock(fromGi: number, toGi: number, after: boolean) {
    const fromNode = flatNodes.value[fromGi]
    const toNode = flatNodes.value[toGi]
    if (!fromNode || !toNode) return
    if (fromNode.parent !== toNode.parent) return // 跨父级拖拽不支持（组内 <-> 顶层需要走 bind/unbind）
    const parent = fromNode.parent
    const fromIdx = fromNode.parentIdx
    const toIdx = toNode.parentIdx
    const item = parent.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    parent.splice(ni, 0, item)
  }

  /** 把新条目插入到"当前激活节点"后面：在组里就插进该组末尾，在顶层就插到后面一位；找不到则追加到末尾。 */
  function insertAfterActive(item: OrderItem, activeIdentifier: string | null | undefined) {
    const activeGi = identifierToGi(activeIdentifier)
    const node = activeGi >= 0 ? flatNodes.value[activeGi] : undefined
    if (node) {
      const parent = node.isGroup ? (node.ref as OrderGroup).children : node.parent
      const idx = node.isGroup ? (node.ref as OrderGroup).children.length : node.parentIdx + 1
      parent.splice(idx, 0, item)
    } else {
      order.value.push(item)
    }
  }

  /** 把 `gi` 处的节点从树里摘掉，返回节点本身及它覆盖的全部叶子 identifier
   *  （组节点覆盖全部 children，叶子节点只覆盖自己）——供 domain 层清理树外状态。 */
  function removeNode(gi: number): { node: OrderNode; identifiers: string[] } | null {
    const node = flatNodes.value[gi]
    if (!node) return null
    const identifiers = node.isGroup
      ? (node.ref as OrderGroup).children.map(c => c.identifier)
      : [(node.ref as OrderItem).identifier]
    node.parent.splice(node.parentIdx, 1)
    selectedGi.value.delete(gi)
    return { node: node.ref, identifiers }
  }

  /** 把当前"顶层选中"的行（parent 是根 order 数组本身）打成一个新组。
   *  选中不足 2 个顶层行时返回 null。返回的 itemCount 是选中了几行，childCount 是实际叶子数。 */
  function bindSelected(): { itemCount: number; childCount: number } | null {
    const topLevelGi = Array.from(selectedGi.value)
      .filter(gi => flatNodes.value[gi]?.parent === order.value)
      .sort((a, b) => a - b)
    if (topLevelGi.length < 2) return null
    // items 按 gi（视觉顺序）升序取，保持原始顺序
    const items = topLevelGi.map(gi => order.value[flatNodes.value[gi].parentIdx])
    // indices 单独降序排序，用于从后往前删除（避免索引漂移）
    const indices = topLevelGi.map(gi => flatNodes.value[gi].parentIdx).sort((a, b) => b - a)
    const firstIdx = Math.min(...indices)
    indices.forEach(idx => order.value.splice(idx, 1))
    const children = items.flatMap(item =>
      isGroupNode(item) ? [...item.children] : [{ identifier: item.identifier, enabled: item.enabled }]
    )
    const group: OrderGroup = {
      id: 'group_' + Date.now(),
      _gid: '_g' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
      name: opts.groupName ? opts.groupName(children.length) : `Group (${children.length})`,
      collapsed: false,
      enabled: true,
      children,
    }
    order.value.splice(firstIdx, 0, group)
    clearSelection()
    return { itemCount: items.length, childCount: children.length }
  }

  function unbindGroup(gi: number): boolean {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return false
    const group = node.ref as OrderGroup
    node.parent.splice(node.parentIdx, 1, ...group.children)
    clearSelection()
    return true
  }

  return {
    selectedGi, anchorGi, flatNodes,
    identifierToGi, revealAndFindGi,
    clearSelection, selectBlock, toggleBlock, toggleGroupCollapse, reorderBlock,
    insertAfterActive, removeNode, bindSelected, unbindGroup,
  }
}
