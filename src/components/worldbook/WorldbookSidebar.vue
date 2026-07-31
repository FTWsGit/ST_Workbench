<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('worldbook.sidebar.title', { count: store.order.length }) }}</span>
      <ListToolbar>
        <button class="wb-btn" @click="store.addEntry()">{{ uiStore.t('worldbook.sidebar.newEntry') }}</button>
      </ListToolbar>
      <div class="wb-sidebar-tools">
        <button class="wb-btn" :disabled="!canBind" @click="store.bindSelected()">{{ uiStore.t('shared.sidebar.bind') }}</button>
        <button class="wb-btn" :disabled="!canUnbind" @click="unbindCurrent()">{{ uiStore.t('shared.sidebar.unbind') }}</button>
        <button class="wb-btn" :class="{ active: toolsOpen }" @click="toolsOpen = !toolsOpen">{{ uiStore.t('worldbook.sidebar.tools') }}</button>
      </div>
    </div>
    <div class="wb-list" ref="listRef">
      <p v-if="!store.order.length" class="wb-preset-cp-empty">{{ uiStore.t('worldbook.sidebar.empty') }}</p>
      <template v-for="(node, gi) in store.flatNodes" :key="nodeKey(node, gi)">
        <!-- 分组头 -->
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="wb-tree-group"
             :class="{ selected: store.selectedGi.has(gi), disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-tree-group-toggle" :class="{ collapsed: (node.ref as OrderGroup).collapsed }" @click.stop="store.toggleGroupCollapse(gi)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span v-if="editingGroupGi !== gi" class="wb-tree-name" @dblclick.stop="startEditGroupName(gi)">{{ (node.ref as OrderGroup).name }}</span>
          <input v-else
                 :ref="(el) => setGroupNameInput(el, gi)"
                 class="wb-tree-group-name-input"
                 :value="(node.ref as OrderGroup).name"
                 @blur="finishEditGroupName(gi, $event)"
                 @keydown.enter.prevent="finishEditGroupName(gi, $event)"
                 @keydown.esc.prevent="cancelEditGroupName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="wb-tree-group-count">{{ (node.ref as OrderGroup).children.length }}</span>
          <span class="wb-tree-actions">
            <span class="wb-tree-act del" @click.stop="store.deleteEntry(gi)">🗑</span>
          </span>
        </div>
        <!-- 条目 -->
        <div v-else
             :ref="(el) => setItemRef(el, gi)"
             class="wb-tree-item"
             :class="{ selected: store.selectedGi.has(gi), disabled: getEntry((node.ref as OrderItem).identifier)?.disabled, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-drag-handle">⠿</span>
          <span class="wb-toggle-sw" :class="{ on: !getEntry((node.ref as OrderItem).identifier)?.disabled }" @click.stop="onToggleEntry((node.ref as OrderItem).identifier)"></span>
          <span v-if="editingBlockGi !== gi" class="wb-tree-name" @dblclick.stop="startEditBlockName(gi)">
            {{ getEntry((node.ref as OrderItem).identifier)?.comment || uiStore.t('common.unnamed') }}
          </span>
          <input v-else
                 :ref="(el) => setBlockNameInput(el, gi)"
                 class="wb-tree-name-input"
                 :value="getEntry((node.ref as OrderItem).identifier)?.comment || ''"
                 @blur="finishEditBlockName(gi, $event)"
                 @keydown.enter.prevent="finishEditBlockName(gi, $event)"
                 @keydown.esc.prevent="cancelEditBlockName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="wb-tree-role">{{ activationLabel(getEntry((node.ref as OrderItem).identifier)) }}</span>
          <span class="wb-tree-actions">
            <span class="wb-tree-act del" @click.stop="store.deleteEntry(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="onResizeStart"></div>
  <WorldbookToolsPanel v-if="toolsOpen" @close="toolsOpen = false" />
</template>

<script setup lang="ts">
/** 世界书侧边栏：分组+条目两级列表，支持拖拽排序/多选/内联重命名/折叠分组/绑定解绑。
 *  不参数化，直接 useWorldbookStore()（只有一个 worldbookStore，无复用需求）。
 *  组件有两个根节点（<aside> + .wb-resize-handle），mobileDrawerOpen 显式绑到 <aside>，不依赖单根自动 class 透传。 */
import { ref, computed, watch } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import type { OrderItem, OrderGroup, FlatNode, WorldbookEntry } from '../../types'
import { usePanelResize } from '../../composables/usePanelResize'
import { useTabsStore } from '../../stores/tabsStore'
import { useListScrollSync } from '../../composables/useListScrollSync'
import { useDragReorder } from '../../composables/useDragReorder'
import { useInlineRename } from '../../composables/useInlineRename'
import { useListSelection } from '../../composables/useListSelection'
import ListToolbar from '../shared/ListToolbar.vue'
import WorldbookToolsPanel from './WorldbookToolsPanel.vue'

const props = defineProps<{ mobileDrawerOpen?: boolean }>()
const toolsOpen = ref(false)

const tabsStore = useTabsStore()
const store = useWorldbookStore()
const uiStore = useUiStore()
const listRef = ref<HTMLElement>()

const { dragIdx, dragOverIdx, dragOverPos, itemEls, setItemRef, onItemMouseDown: onDragPointerDown, consumeSuppressClick: consumeDragSuppressClick } =
  useDragReorder<number>({ autoScrollContainer: () => listRef.value })

const canBind = computed(() => {
  const topLevel = Array.from(store.selectedGi).filter(gi => store.flatNodes[gi]?.parent === store.order)
  return topLevel.length >= 2
})
const canUnbind = computed(() => Array.from(store.selectedGi).some(gi => store.flatNodes[gi]?.isGroup ?? false))

function getEntry(id: string): WorldbookEntry | undefined {
  return store.entries.find(e => String(e.uid) === id)
}
function activationLabel(entry: WorldbookEntry | undefined) {
  if (!entry) return ''
  if (entry.constant) return uiStore.t('worldbook.activation.constant')
  if (entry.vectorized) return uiStore.t('worldbook.activation.vectorized')
  return uiStore.t('worldbook.activation.keyWord')
}
function onToggleEntry(id: string) {
  const e = getEntry(id)
  if (e) store.toggleEntryDisabled(e)
}

function nodeKey(node: FlatNode, gi: number) {
  return node.isGroup ? (node.ref as OrderGroup).id : (node.ref as OrderItem).identifier + '_' + gi
}
function itemStyle(node: FlatNode) {
  return node.depth > 0 ? { paddingLeft: (8 + node.depth * 16) + 'px' } : {}
}
function unbindCurrent() {
  const groupGi = Array.from(store.selectedGi).find(gi => store.flatNodes[gi]?.isGroup ?? false)
  if (groupGi === undefined) return
  store.unbindGroup(groupGi)
}

/** 内联重命名——分组名 */
const {
  editingId: editingGroupGi, setInputRef: setGroupNameInputRaw,
  start: startEditGroupNameRaw, finish: finishEditGroupName, cancel: cancelEditGroupName,
} = useInlineRename<number>({
  getCurrentName: (gi) => { const node = store.flatNodes[gi]; return node && node.isGroup ? (node.ref as OrderGroup).name : '' },
  onCommit: (gi, newName) => { const node = store.flatNodes[gi]; if (node && node.isGroup) (node.ref as OrderGroup).name = newName },
})
function setGroupNameInput(el: any, _gi: number) { setGroupNameInputRaw(el) }
function startEditGroupName(gi: number) { const node = store.flatNodes[gi]; if (node && node.isGroup) startEditGroupNameRaw(gi) }

/** 内联重命名——条目名（entry.comment，提交时同步 renameTab） */
const {
  editingId: editingBlockGi, setInputRef: setBlockNameInputRaw,
  start: startEditBlockNameRaw, finish: finishEditBlockName, cancel: cancelEditBlockName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return ''
    return getEntry((node.ref as OrderItem).identifier)?.comment || ''
  },
  onCommit: (gi, newName) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return
    const e = getEntry((node.ref as OrderItem).identifier)
    if (!e) return
    e.comment = newName
    store.markDirty()
    tabsStore.renameTab('worldbook', e.uid + '', newName)
  },
})
function setBlockNameInput(el: any, _gi: number) { setBlockNameInputRaw(el) }
function startEditBlockName(gi: number) { const node = store.flatNodes[gi]; if (node && !node.isGroup) startEditBlockNameRaw(gi) }

const resize = usePanelResize({
  getWidth: () => uiStore.settings.sidebarWidth,
  setWidth: (w) => { uiStore.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
function onResizeStart(e: PointerEvent) { resize.onPointerDown(e) }
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

/** 激活条目滚动同步（按 identifier 解析 gi）。 */
useListScrollSync({
  domain: 'worldbook',
  itemEls,
  keyOf: () => {
    const tab = tabsStore.activeTab
    if (!tab) return null
    const gi = store.identifierToGi(tab.key)
    return gi >= 0 ? gi : null
  },
})

function onDragDrop(from: number, to: number, after: boolean) {
  store.reorderBlock(from, to, after)
}

const listSelection = useListSelection<number>({
  onSelect: (mode, gi) => {
    if (mode !== 'single') {
      store.selectBlock(gi, { ctrl: mode === 'ctrl', shift: mode === 'shift' })
      return
    }
    const node = store.flatNodes[gi]
    if (!node) return
    store.selectedGi.clear()
    store.selectedGi.add(gi)
    store.anchorGi = gi
    if (node.isGroup) {
      store.toggleGroupCollapse(gi)
    } else {
      const item = node.ref as OrderItem
      const entry = getEntry(item.identifier)
      tabsStore.open({ domain: 'worldbook', key: item.identifier, label: entry?.comment || uiStore.t('common.unnamed'), workspace: 'worldbook' })
    }
  },
})

function onItemMouseDown(i: number, e: PointerEvent) {
  if (listSelection.onPointerDown(i, e)) return
  onDragPointerDown(i, e, onDragDrop)
}
function onItemClick(gi: number, e: MouseEvent) {
  if (consumeDragSuppressClick()) return
  if (listSelection.consumeSuppressClick()) return
  if (!store.flatNodes[gi]) return
  listSelection.onClick(gi, e)
}
</script>
