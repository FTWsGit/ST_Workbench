import { ref, computed, type Ref } from 'vue'
import type { OrderNode, OrderGroup, OrderItem, FlatNode } from '../types'
import { applyMultiSelect } from '../utils'

export function isGroupNode(node: OrderNode): node is OrderGroup {
  return 'children' in node && Array.isArray((node as any).children)
}

export interface UseGroupedListOptions {
  /** 新建组时的默认名字，参数是组里的条目数。默认 `Group (N)`——沿用 presetStore 原来的写死英文，
   *  没有跟着 t() 走 i18n，是从原实现原样搬过来的，不是这次重构引入的新行为。 */
  groupName?: (count: number) => string
}

/** flatNodes 构建 + 选择/折叠/绑定/拆组/重排这套「树形分组列表」机制，从 presetStore.ts 里抽出来。
 *
 * 这里只管树本身的形状（`OrderNode[]`，identifier 是唯一跟"内容是什么"沾边的字段），完全不知道
 * `prompts`/`tabsStore`/`confirmStore`/`markDirty`/`showToast` 的存在——这些是 preset 这个 domain
 * 自己的关注点，不属于"分组列表"这个通用机制。所以像 deleteBlock（要弹确认框、要检查 marker、要关
 * 联删 prompts 数组里的数据、要关 tab）这种明显 domain-specific 的操作没有搬进来，composable 只
 * 提供 removeNode() 这个纯树操作原语，返回被删节点覆盖的 identifier 列表，domain 层拿着这个列表自
 * 己去做后续清理。addBlock/addHiddenBlock 同理，只搬了"插入到当前激活节点后面，找不到就追加到末尾"
 * 这条纯位置逻辑（insertAfterActive），至于要 push 到哪个数据数组、要不要打开 tab，还是domain层的事。
 *
 * 这套东西天生就是 identifier-based 的树形容器，跟"节点内容到底是预设块还是世界书条目"无关——
 * 世界书如果以后要做分组 UI，可以直接复用这个 composable，不需要为它单独发明一套。目前只有 preset
 * 在用；worldbook/character 阶段真的需要分组时再接，不提前为不存在的调用方加参数。 */
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

  /** identifier -> gi，但先自动展开包着它的折叠组。flatNodes 故意不含折叠组里的子节点（这正是
   *  折叠/展开渲染的驱动方式，见上面 walk()），可搜索结果/变量跳转这些入口指向的块可能藏在任意
   *  一个折叠组里——不这么处理的话，flatNodes.findIndex 对折叠组里的东西一律返回 -1，跳转变成
   *  静默无操作（该选中的块没选中，也没有任何反馈）。 */
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

  /** 把一个新条目插入到"当前激活节点"后面：激活节点在组里就插进那个组的末尾，在顶层就插到它
   *  后面一位；找不到激活节点（没有/已不在树里）就整体追加到最后。identifier 找不到时的兜底也是
   *  同一行为，调用方不需要自己再判断一次。 */
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

  /** 把 `gi` 处的节点从树里摘掉（从它的 parent 数组里 splice 掉），返回这个节点本身，以及它覆盖
   *  的全部叶子 identifier（组节点覆盖它全部 children，叶子节点只覆盖自己）——调用方用这份
   *  identifier 列表去清理树外面的 domain 状态（关 tab、删 prompts 里对应的数据行……），这些
   *  composable 完全不知道、也不需要知道。 */
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

  /** 把当前"顶层选中"的行（parent 是根 order 数组本身——嵌套在已展开组里的选中不可绑定，跟原
   *  实现一样的限制）打成一个新组。选中不足 2 个顶层行时返回 null，调用方据此决定要不要提示。
   *  返回的 itemCount 是"选中了几行"（原实现 toast 用的就是这个数，一个已有的组算一行，不展开
   *  数它里面有几个子项），childCount 才是打包后新组里实际的叶子条目数——两者选了 >=1 个已有组
   *  时会不一样，调用方按需选用，默认 toast 语义用 itemCount 保持跟原来一致。 */
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
