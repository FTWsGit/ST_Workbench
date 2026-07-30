<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('preset.sidebar.title', { count: store.order.length }) }}</span>
      <ListToolbar>
        <button class="wb-btn" @click="store.addBlock()">{{ uiStore.t('preset.sidebar.newBlock') }}</button>
        <button class="wb-btn" @click="store.hiddenOpen = true">{{ uiStore.t('preset.sidebar.hiddenBlock') }}</button>
      </ListToolbar>
      <div class="wb-sidebar-tools">
        <button class="wb-btn" :disabled="!canBind" @click="store.bindSelected()">{{ uiStore.t('shared.sidebar.bind') }}</button>
        <button class="wb-btn" :disabled="!canUnbind" @click="unbindCurrent()">{{ uiStore.t('shared.sidebar.unbind') }}</button>
      </div>
    </div>
    <div class="wb-list" ref="listRef">
      <template v-for="(node, gi) in store.flatNodes" :key="nodeKey(node, gi)">
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="pr-group-header"
             :class="{ selected: store.selectedGi.has(gi), disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="pr-group-toggle" :class="{ collapsed: (node.ref as OrderGroup).collapsed }" @click.stop="onGroupToggle(gi)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span v-if="editingGroupGi !== gi" class="pr-block-name" @dblclick.stop="startEditGroupName(gi)">{{ (node.ref as OrderGroup).name }}</span>
          <input v-else
                 :ref="(el) => setGroupNameInput(el, gi)"
                 class="pr-group-name-input"
                 :value="(node.ref as OrderGroup).name"
                 @blur="finishEditGroupName(gi, $event)"
                 @keydown.enter.prevent="finishEditGroupName(gi, $event)"
                 @keydown.esc.prevent="cancelEditGroupName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="pr-group-count">{{ (node.ref as OrderGroup).children.length }}</span>
          <span class="pr-block-actions">
            <span class="pr-block-act" @click.stop="store.toggleBlock(gi)">👁</span>
            <span class="pr-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
        <div v-else
             :ref="(el) => setItemRef(el, gi)"
             class="pr-block-item"
             :class="{ selected: store.selectedGi.has(gi), disabled: !(node.ref as OrderItem).enabled, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-drag-handle">⠿</span>
          <span class="wb-toggle-sw" :class="{ on: (node.ref as OrderItem).enabled }" @click.stop="store.toggleBlock(gi)"></span>
          <span v-if="editingBlockGi !== gi" class="pr-block-name" @dblclick.stop="startEditBlockName(gi)">
            {{ getBlock((node.ref as OrderItem).identifier)?.name || (node.ref as OrderItem).identifier }}
          </span>
          <input v-else
                 :ref="(el) => setBlockNameInput(el, gi)"
                 class="pr-block-name-input"
                 :value="getBlock((node.ref as OrderItem).identifier)?.name || (node.ref as OrderItem).identifier"
                 @blur="finishEditBlockName(gi, $event)"
                 @keydown.enter.prevent="finishEditBlockName(gi, $event)"
                 @keydown.esc.prevent="cancelEditBlockName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="pr-block-role" :class="roleClass((node.ref as OrderItem).identifier)">{{ getBlock((node.ref as OrderItem).identifier)?.role || 'system' }}</span>
          <span class="pr-block-actions">
            <span class="pr-block-act" @click.stop="store.hideBlock(gi)">👁</span>
            <span class="pr-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="onResizeStart"></div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import type { OrderItem, OrderGroup, FlatNode } from '../../types'
import { usePanelResize } from '../../composables/usePanelResize'
import { roleClass as roleClassOf } from '../../utils'
import { useTabsStore } from '../../stores/tabsStore'
import { useListScrollSync } from '../../composables/useListScrollSync'
import { useDragReorder } from '../../composables/useDragReorder'
import { useInlineRename } from '../../composables/useInlineRename'
import { useListSelection } from '../../composables/useListSelection'
import ListToolbar from '../shared/ListToolbar.vue'

/**
 * 显式 prop：本组件模板是双根节点（<aside> + 同级 .wb-resize-handle），Vue 不会自动把父级 :class/attrs
 * 透传到多根组件的根元素上（会被静默丢弃），因此用 prop 显式接收移动端抽屉类名。
 */
const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const tabsStore = useTabsStore()
const store = usePresetStore()
const uiStore = useUiStore()
const listRef = ref<HTMLElement>()

/**
 * 拖拽重排机制（指针跟踪、近边自动滚动、节流的拖放位置计算、文本选择抑制）位于 useDragReorder。
 * 这里保留 preset 特有逻辑：onDrop 的 (from, to, after) 直接交给 store.reorderBlock 处理 group-insert 语义。
 */
const {
  dragIdx, dragOverIdx, dragOverPos, itemEls,
  setItemRef,
  onItemMouseDown: onDragPointerDown,
  consumeSuppressClick: consumeDragSuppressClick,
} = useDragReorder<number>({ autoScrollContainer: () => listRef.value })

const canBind = computed(() => {
  const topLevel = Array.from(store.selectedGi).filter(gi =>
    store.flatNodes[gi]?.parent === store.order
  )
  return topLevel.length >= 2
})
const canUnbind = computed(() => {
  return Array.from(store.selectedGi).some(gi => {
    const node = store.flatNodes[gi]
    return node?.isGroup ?? false
  })
})

function getBlock(id: string) { return store.prompts.find(p => p.identifier === id) }
function roleClass(id: string) {
  return roleClassOf(getBlock(id)?.role)
}

function nodeKey(node: FlatNode, gi: number) {
  return node.isGroup ? (node.ref as OrderGroup).id : (node.ref as OrderItem).identifier + '_' + gi
}
function itemStyle(node: FlatNode) {
  return node.depth > 0 ? { paddingLeft: (8 + node.depth * 16) + 'px' } : {}
}
function unbindCurrent() {
  const groupGi = Array.from(store.selectedGi).find(gi => {
    const node = store.flatNodes[gi]
    return node?.isGroup ?? false
  })
  if (groupGi === undefined) return
  store.unbindGroup(groupGi)
}

/** 分组名就地编辑（useInlineRename）。 */
const {
  editingId: editingGroupGi,
  setInputRef: setGroupNameInputRaw,
  start: startEditGroupNameRaw,
  finish: finishEditGroupName,
  cancel: cancelEditGroupName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.flatNodes[gi]
    return node && node.isGroup ? (node.ref as OrderGroup).name : ''
  },
  onCommit: (gi, newName) => {
    const node = store.flatNodes[gi]
    if (node && node.isGroup) (node.ref as OrderGroup).name = newName
  },
})
function setGroupNameInput(el: any, _gi: number) { setGroupNameInputRaw(el) }
function startEditGroupName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || !node.isGroup) return
  startEditGroupNameRaw(gi)
}

/** block 名就地编辑。重命名需要同步 markDirty 并更新 tabsStore 标签名。 */
const {
  editingId: editingBlockGi,
  setInputRef: setBlockNameInputRaw,
  start: startEditBlockNameRaw,
  finish: finishEditBlockName,
  cancel: cancelEditBlockName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return ''
    const item = node.ref as OrderItem
    return getBlock(item.identifier)?.name || item.identifier
  },
  onCommit: (gi, newName) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return
    const item = node.ref as OrderItem
    const p = store.prompts.find(pp => pp.identifier === item.identifier)
    if (!p) return
    p.name = newName
    store.markDirty() // 嵌套字段变更，浅层 prompts watch 捕获不到
    tabsStore.renameTab('preset', item.identifier, newName || item.identifier)
  },
})
function setBlockNameInput(el: any, _gi: number) { setBlockNameInputRaw(el) }
function startEditBlockName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || node.isGroup) return
  startEditBlockNameRaw(gi)
}

function onGroupToggle(gi: number) {
  store.toggleGroupCollapse(gi)
}

/** 侧边栏宽度拖拽：实时改 ref，拖拽结束后持久化。 */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.sidebarWidth,
  setWidth: (w) => { uiStore.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
function onResizeStart(e: PointerEvent) { resize.onPointerDown(e) }
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

/**
 * 跳转请求时把当前激活标签对应的行滚入视口。
 * 基于 activeTab.key 通过 store.identifierToGi() 反查 gi，复用 useDragReorder 已填充的 itemEls 映射。
 */
useListScrollSync({
  domain: 'preset',
  itemEls,
  keyOf: () => {
    const tab = tabsStore.activeTab
    if (!tab) return null
    const gi = store.identifierToGi(tab.key)
    return gi >= 0 ? gi : null
  },
})

/** 拖放落点：直接交给 store.reorderBlock 处理分组插入语义。 */
function onDragDrop(from: number, to: number, after: boolean) {
  store.reorderBlock(from, to, after)
}

/**
 * 列表选择：鼠标/触摸的单选、Ctrl/Cmd 多选、Shift 区间选、长按多选统一由 useListSelection 识别。
 * - 多选（ctrl/shift/长按）走 store.selectBlock（与外部跳转选中等共享同一状态转换实现）；
 * - 普通点击：本地清空选中并只选当前行，点组标题切换折叠，点 block 打开对应标签。
 * 触摸拖动必须落在 .wb-drag-handle 上才启动拖拽；行其它位置留给原生滚动/长按选择，避免与滚动手势冲突。
 */
const listSelection = useListSelection<number>({
  onSelect: (mode, gi) => {
    if (mode !== 'single') {
      store.selectBlock(gi, { ctrl: mode === 'ctrl', shift: mode === 'shift' })
      return
    }
    const node = store.flatNodes[gi]
    if (!node) return
    // 本地直接维护 selectedGi/anchorGi：重复点击已激活 tab 也能重置高亮
    store.selectedGi.clear()
    store.selectedGi.add(gi)
    store.anchorGi = gi
    if (node.isGroup) {
      store.toggleGroupCollapse(gi)
    } else {
      const item = node.ref as OrderItem
      const block = store.prompts.find(p => p.identifier === item.identifier)
      tabsStore.open({ domain: 'preset', key: item.identifier, label: block?.name || item.identifier, workspace: 'preset' })
    }
  },
})

function onItemMouseDown(i: number, e: PointerEvent) {
  if (listSelection.onPointerDown(i, e)) return // 触摸在 drag handle 外：走长按选择，不启动拖拽
  onDragPointerDown(i, e, onDragDrop)
}

function onItemClick(gi: number, e: MouseEvent) {
  if (consumeDragSuppressClick()) return
  if (listSelection.consumeSuppressClick()) return
  if (!store.flatNodes[gi]) return
  listSelection.onClick(gi, e)
}
</script>
