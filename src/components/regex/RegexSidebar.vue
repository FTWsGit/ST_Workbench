<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('regex.sidebar.title', { count: store.regexScripts.length }) }}</span>
      <ListToolbar>
        <button class="wb-btn" @click="onAdd">{{ uiStore.t('regex.sidebar.newScript') }}</button>
      </ListToolbar>
      <div class="wb-sidebar-tools">
        <button class="wb-btn" :disabled="!canBind" @click="store.regexBindSelected()">{{ uiStore.t('shared.sidebar.bind') }}</button>
        <button class="wb-btn" :disabled="!canUnbind" @click="unbindCurrent()">{{ uiStore.t('shared.sidebar.unbind') }}</button>
      </div>
    </div>
    <div class="wb-list" ref="listRef">
      <p v-if="!store.regexScripts.length" class="wb-preset-cp-empty">{{ uiStore.t('regex.sidebar.empty') }}</p>
      <template v-for="(node, gi) in store.regexFlatNodes" :key="nodeKey(node, gi)">
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="wb-tree-group"
             :class="{ selected: store.regexSelectedGi.has(gi), disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-tree-group-toggle" :class="{ collapsed: (node.ref as OrderGroup).collapsed }" @click.stop="onGroupToggle(gi)">
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
            <span class="wb-tree-act del" @click.stop="onDeleteGroup(gi)">🗑</span>
          </span>
        </div>
        <div v-else
             :ref="(el) => setItemRef(el, gi)"
             class="wb-tree-item"
             :class="{ selected: store.regexSelectedGi.has(gi), disabled: (node.ref as OrderItem).enabled === false, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-drag-handle">⠿</span>
          <span class="wb-toggle-sw" :class="{ on: (node.ref as OrderItem).enabled }" :title="uiStore.t('regex.sidebar.toggleTitle')" @click.stop="store.regexToggleBlock(gi)"></span>
          <span v-if="editingBlockGi !== gi" class="wb-tree-name" @dblclick.stop="startEditBlockName(gi)">
            {{ getScript((node.ref as OrderItem).identifier)?.scriptName || uiStore.t('common.unnamed') }}
          </span>
          <input v-else
                 :ref="(el) => setBlockNameInput(el, gi)"
                 class="wb-tree-name-input"
                 :value="getScript((node.ref as OrderItem).identifier)?.scriptName || ''"
                 @blur="finishEditBlockName(gi, $event)"
                 @keydown.enter.prevent="finishEditBlockName(gi, $event)"
                 @keydown.esc.prevent="cancelEditBlockName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="wb-tree-actions">
            <span class="wb-tree-act del" :title="uiStore.t('regex.sidebar.deleteTitle')" @click.stop="onDeleteBlock(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="onResizeStart"></div>
</template>

<script setup lang="ts">
/** 正则脚本侧边栏：分组+脚本两级列表，支持拖拽排序/多选/内联重命名/折叠分组/绑定解绑。
 *  不参数化，按 tabsStore.activeWorkspace 选 preset/character store（直接用 store，同 PresetSidebar/WorldbookSidebar 模式）。
 *  组件有两个根节点（<aside> + .wb-resize-handle），mobileDrawerOpen 显式绑到 <aside>。 */
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { usePresetStore } from '../../stores/presetStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useConfirmStore } from '../../stores/confirmStore'
import type { OrderItem, OrderGroup, FlatNode, RegexScript } from '../../types'
import { usePanelResize } from '../../composables/usePanelResize'
import { useListScrollSync } from '../../composables/useListScrollSync'
import { useDragReorder } from '../../composables/useDragReorder'
import { useInlineRename } from '../../composables/useInlineRename'
import { useListSelection } from '../../composables/useListSelection'
import { esc } from '../../utils'
import ListToolbar from '../shared/ListToolbar.vue'

const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const tabsStore = useTabsStore()
const uiStore = useUiStore()
const confirmStore = useConfirmStore()
const presetStore = usePresetStore()
const characterStore = useCharacterStore()
const workspace = computed(() => tabsStore.activeWorkspace)
/** 不包 computed：computed(() => ws === 'character' ? character : preset) 的 .value unwrap 会让模板读
 *  store.regexSelectedGi.has(gi) 时丢失底层 ref 响应式追踪（命中高亮不更新）。Pinia store 单例，
 *  按 workspace 直接取实例，watch workspace 切换时重赋 store ref。 */
const store = ref<typeof presetStore | typeof characterStore>(presetStore)
watch(workspace, (ws) => { store.value = ws === 'character' ? characterStore : presetStore }, { immediate: true })
const listRef = ref<HTMLElement>()

/** 拖拽重排（useDragReorder）。onDrop 的 (from, to, after) 交给 store.reorderRegexBlock 处理分组插入语义。 */
const {
  dragIdx, dragOverIdx, dragOverPos, itemEls,
  setItemRef,
  onItemMouseDown: onDragPointerDown,
  consumeSuppressClick: consumeDragSuppressClick,
} = useDragReorder<number>({ autoScrollContainer: () => listRef.value })

const canBind = computed(() => {
  const s = store.value
  const topLevel = Array.from(s.regexSelectedGi).filter(gi =>
    s.regexFlatNodes[gi]?.parent === s.regexOrder
  )
  return topLevel.length >= 2
})
const canUnbind = computed(() => {
  return Array.from(store.value.regexSelectedGi).some(gi => {
    const node = store.value.regexFlatNodes[gi]
    return node?.isGroup ?? false
  })
})

function getScript(id: string): RegexScript | undefined {
  return store.value.regexScripts.find((r: RegexScript) => r.id === id)
}

function nodeKey(node: FlatNode, gi: number) {
  return node.isGroup ? (node.ref as OrderGroup).id : (node.ref as OrderItem).identifier + '_' + gi
}
function itemStyle(node: FlatNode) {
  return node.depth > 0 ? { paddingLeft: (8 + node.depth * 16) + 'px' } : {}
}
function unbindCurrent() {
  const s = store.value
  const groupGi = Array.from(s.regexSelectedGi).find(gi => {
    const node = s.regexFlatNodes[gi]
    return node?.isGroup ?? false
  })
  if (groupGi === undefined) return
  s.regexUnbindGroup(groupGi)
}

/** 分组名就地编辑（useInlineRename）。提交时同步组名到 regexScripts 的 _gname 字段。 */
const {
  editingId: editingGroupGi,
  setInputRef: setGroupNameInputRaw,
  start: startEditGroupNameRaw,
  finish: finishEditGroupName,
  cancel: cancelEditGroupName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.value.regexFlatNodes[gi]
    return node && node.isGroup ? (node.ref as OrderGroup).name : ''
  },
  onCommit: (gi, newName) => {
    const s = store.value
    const node = s.regexFlatNodes[gi]
    if (!node || !node.isGroup) return
    (node.ref as OrderGroup).name = newName
    // sync _gname 回所有属于该组的 script
    const gid = (node.ref as OrderGroup)._gid
    s.regexScripts.forEach((script: RegexScript) => {
      if (script._gid === gid) script._gname = newName
    })
    s.markDirty()
  },
})
function setGroupNameInput(el: any, _gi: number) { setGroupNameInputRaw(el) }
function startEditGroupName(gi: number) {
  const node = store.value.regexFlatNodes[gi]
  if (!node || !node.isGroup) return
  startEditGroupNameRaw(gi)
}

/** block 名就地编辑。提交时同步 scriptName + renameTab + markDirty。 */
const {
  editingId: editingBlockGi,
  setInputRef: setBlockNameInputRaw,
  start: startEditBlockNameRaw,
  finish: finishEditBlockName,
  cancel: cancelEditBlockName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.value.regexFlatNodes[gi]
    if (!node || node.isGroup) return ''
    const item = node.ref as OrderItem
    return getScript(item.identifier)?.scriptName || ''
  },
  onCommit: (gi, newName) => {
    const s = store.value
    const node = s.regexFlatNodes[gi]
    if (!node || node.isGroup) return
    const item = node.ref as OrderItem
    const script = getScript(item.identifier)
    if (!script) return
    script.scriptName = newName
    s.markDirty()
    tabsStore.renameTab('regex', item.identifier, newName)
  },
})
function setBlockNameInput(el: any, _gi: number) { setBlockNameInputRaw(el) }
function startEditBlockName(gi: number) {
  const node = store.value.regexFlatNodes[gi]
  if (!node || node.isGroup) return
  startEditBlockNameRaw(gi)
}

function onGroupToggle(gi: number) {
  store.value.regexToggleGroupCollapse(gi)
}

/** 新建脚本：调 store.addRegexScript，打开对应标签。 */
function onAdd() {
  const s = store.value
  const id = s.addRegexScript()
  if (!id) return
  const script = s.regexScripts.find((r: RegexScript) => r.id === id)
  tabsStore.open({ domain: 'regex', key: id, label: script?.scriptName || uiStore.t('common.unnamed'), workspace: workspace.value })
}

/** 删除单个脚本（叶子节点）：confirmStore 确认后调 store.deleteRegexScript + close tab。 */
function onDeleteBlock(gi: number) {
  const s = store.value
  const node = s.regexFlatNodes[gi]
  if (!node || node.isGroup) return
  const item = node.ref as OrderItem
  const script = getScript(item.identifier)
  if (!script) return
  confirmStore.ask({
    title: uiStore.t('regex.confirm.delete.title'),
    message: uiStore.t('regex.confirm.delete.message', { name: esc(script.scriptName || script.id) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => { s.deleteRegexScript(script.id); tabsStore.close('regex', script.id) },
  })
}

/** 删除分组（组节点）：confirmStore 确认后摘组 + 删全部子脚本 + 关 tab。
 *  不用 store.regexRemoveNode（那是 useGroupedList 纯树原语，不碰 scripts 数组/tabsStore）。 */
function onDeleteGroup(gi: number) {
  const s = store.value
  const node = s.regexFlatNodes[gi]
  if (!node || !node.isGroup) return
  const group = node.ref as OrderGroup
  const childIds = group.children.map(c => c.identifier)
  confirmStore.ask({
    title: uiStore.t('regex.confirm.delete.title'),
    message: uiStore.t('regex.confirm.delete.message', { name: esc(group.name) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => {
      s.regexRemoveNode(gi)
      childIds.forEach(id => { s.deleteRegexScript(id); tabsStore.close('regex', id) })
    },
  })
}

/** 侧边栏宽度拖拽：实时改 uiStore.settings.sidebarWidth，拖拽结束后持久化。 */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.sidebarWidth,
  setWidth: (w) => { uiStore.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
function onResizeStart(e: PointerEvent) { resize.onPointerDown(e) }
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

/** 激活脚本滚动同步：通过 tabsStore.activeTab.key 反查 gi。 */
useListScrollSync({
  domain: 'regex',
  itemEls,
  keyOf: () => {
    const tab = tabsStore.activeTab
    if (!tab) return null
    const gi = store.value.regexIdentifierToGi(tab.key)
    return gi >= 0 ? gi : null
  },
})

/** 拖放落点：直接交给 store.reorderRegexBlock 处理分组插入语义。 */
function onDragDrop(from: number, to: number, after: boolean) {
  store.value.reorderRegexBlock(from, to, after)
}

/** 标签驱动侧边栏选中态：activeTab 变化时展开目标所在折叠组 + 重置 selectedGi/anchorGi 成单行。
 *  这是"点 tab/reload 后高亮切到新行"的唯一实现——漏接这个 watcher 的话点 tab 只切编辑区内容，
 *  sidebar 选中态没跟着重置（旧 selectedGi 残留 → reload 高亮持续）。同 PresetSidebar/WorldbookSidebar 模式。 */
watch(() => tabsStore.activeTab, (tab) => {
  if (!tab || tab.domain !== 'regex' || tab.workspace !== workspace.value) {
    store.value.regexClearSelection()
    return
  }
  const gi = store.value.regexRevealAndFindGi(tab.key)
  if (gi < 0) return
  store.value.regexSelectedGi = new Set([gi])
  store.value.regexAnchorGi = gi
}, { immediate: true, flush: 'sync' })

/**
 * 列表选择（同 PresetSidebar/WorldbookSidebar 模式）：
 * - 多选（ctrl/shift/长按）走 store.regexSelectBlock；
 * - 普通点击：本地清空选中并只选当前行，点组标题切换折叠，点脚本打开对应标签。
 */
const listSelection = useListSelection<number>({
  onSelect: (mode, gi) => {
    const s = store.value
    if (mode !== 'single') {
      s.regexSelectBlock(gi, { ctrl: mode === 'ctrl', shift: mode === 'shift' })
      return
    }
    const node = s.regexFlatNodes[gi]
    if (!node) return
    s.regexSelectedGi.clear()
    s.regexSelectedGi.add(gi)
    s.regexAnchorGi = gi
    if (node.isGroup) {
      s.regexToggleGroupCollapse(gi)
    } else {
      const item = node.ref as OrderItem
      const script = getScript(item.identifier)
      tabsStore.open({ domain: 'regex', key: item.identifier, label: script?.scriptName || uiStore.t('common.unnamed'), workspace: workspace.value })
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
  if (!store.value.regexFlatNodes[gi]) return
  listSelection.onClick(gi, e)
}
</script>
