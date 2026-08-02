<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('tavern.sidebar.title', { count: store.tavernHelper.scripts.length }) }}</span>
      <ListToolbar>
        <button class="wb-btn" @click="onAdd">{{ uiStore.t('tavern.sidebar.newScript') }}</button>
      </ListToolbar>
      <div class="wb-sidebar-tools">
        <button class="wb-btn" :disabled="!canBind" @click="store.scriptTreeBindSelected()">{{ uiStore.t('shared.sidebar.bind') }}</button>
        <button class="wb-btn" :disabled="!canUnbind" @click="unbindCurrent()">{{ uiStore.t('shared.sidebar.unbind') }}</button>
      </div>
    </div>
    <div class="wb-list" ref="listRef">
      <p v-if="!store.tavernHelper.scripts.length" class="wb-preset-cp-empty">{{ uiStore.t('tavern.sidebar.empty') }}</p>
      <template v-for="(node, gi) in store.scriptTreeFlatNodes" :key="nodeKey(node, gi)">
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="wb-tree-group"
             :class="{ selected: store.scriptTreeSelectedGi.has(gi), disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
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
             :class="{ selected: store.scriptTreeSelectedGi.has(gi), disabled: (node.ref as OrderItem).enabled === false, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="wb-drag-handle">⠿</span>
          <span class="wb-toggle-sw" :class="{ on: (node.ref as OrderItem).enabled }" :title="uiStore.t('tavern.sidebar.toggleTitle')" @click.stop="store.scriptTreeToggleBlock(gi)"></span>
          <template v-if="isFolder((node.ref as OrderItem).identifier)">
            <span v-if="editingFolderGi !== gi" class="wb-tree-name" @dblclick.stop="startEditFolderName(gi)">
              {{ getFolder((node.ref as OrderItem).identifier)?.name || uiStore.t('common.unnamed') }}
            </span>
            <input v-else
                   :ref="(el) => setFolderNameInput(el, gi)"
                   class="wb-tree-name-input"
                   :value="getFolder((node.ref as OrderItem).identifier)?.name || ''"
                   @blur="finishEditFolderName(gi, $event)"
                   @keydown.enter.prevent="finishEditFolderName(gi, $event)"
                   @keydown.esc.prevent="cancelEditFolderName()"
                   @click.stop
                   @pointerdown.stop />
            <span class="wb-tree-folder-tag" :style="{ color: getFolder((node.ref as OrderItem).identifier)?.color }">{{ getFolder((node.ref as OrderItem).identifier)?.icon || '📁' }}</span>
          </template>
          <template v-else>
            <span v-if="editingScriptGi !== gi" class="wb-tree-name" @dblclick.stop="startEditScriptName(gi)">
              {{ getScript((node.ref as OrderItem).identifier)?.name || uiStore.t('common.unnamed') }}
            </span>
            <input v-else
                   :ref="(el) => setScriptNameInput(el, gi)"
                   class="wb-tree-name-input"
                   :value="getScript((node.ref as OrderItem).identifier)?.name || ''"
                   @blur="finishEditScriptName(gi, $event)"
                   @keydown.enter.prevent="finishEditScriptName(gi, $event)"
                   @keydown.esc.prevent="cancelEditScriptName()"
                   @click.stop
                   @pointerdown.stop />
          </template>
          <span class="wb-tree-actions">
            <span class="wb-tree-act del" :title="uiStore.t('tavern.sidebar.deleteTitle')" @click.stop="onDeleteBlock(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="onResizeStart"></div>
</template>

<script setup lang="ts">
/** tavern_helper 脚本树侧边栏：分组+脚本两级列表，支持拖拽排序/多选/内联重命名/折叠分组/绑定解绑。
 *  抄 RegexSidebar 全套路，改名换域。folder 是顶层 OrderItem，展示 icon/color 标签（只读）。
 *  组件有两个根节点（<aside> + .wb-resize-handle），mobileDrawerOpen 显式绑到 <aside>。 */
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { usePresetStore } from '../../stores/presetStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useConfirmStore } from '../../stores/confirmStore'
import type { OrderItem, OrderGroup, FlatNode, ScriptTree, Script, ScriptFolder } from '../../types'
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
 *  store.scriptTreeSelectedGi.has(gi) 时丢失底层 ref 响应式追踪（命中高亮不更新）。Pinia store 单例，
 *  按 workspace 直接取实例，watch workspace 切换时重赋 store ref。 */
const store = ref<typeof presetStore | typeof characterStore>(presetStore)
watch(workspace, (ws) => { store.value = ws === 'character' ? characterStore : presetStore }, { immediate: true })
const listRef = ref<HTMLElement>()

/** 拖拽重排（useDragReorder）。onDrop 的 (from, to, after) 交给 store.reorderScriptTreeBlock 处理分组插入语义。 */
const {
  dragIdx, dragOverIdx, dragOverPos, itemEls,
  setItemRef,
  onItemMouseDown: onDragPointerDown,
  consumeSuppressClick: consumeDragSuppressClick,
} = useDragReorder<number>({ autoScrollContainer: () => listRef.value })

const canBind = computed(() => {
  const s = store.value
  const topLevel = Array.from(s.scriptTreeSelectedGi).filter(gi =>
    s.scriptTreeFlatNodes[gi]?.parent === s.scriptTreeOrder
  )
  return topLevel.length >= 2
})
const canUnbind = computed(() => {
  return Array.from(store.value.scriptTreeSelectedGi).some(gi => {
    const node = store.value.scriptTreeFlatNodes[gi]
    return node?.isGroup ?? false
  })
})

/** 按 id 预索引 tavernHelper.scripts——模板 v-for 每节点调 getScript/getFolder/isFolder，
 *  不预索引的话每次渲染都对全数组做 O(n) find/some，n 节点 × O(n) = O(n²) 响应式属性访问，
 *  大脚本树下秒级卡死（主因是 watcher 缺幂等守卫每次切 tab 换新 Set 引发整表重渲染，这个是放大因子）。
 *  Map 按 id 索引摊成 O(1) 查表。scripts 数组变（add/delete/reorder/sync）时 computed 重算重建 Map。 */
const scriptsById = computed(() => {
  const m = new Map<string, ScriptTree>()
  for (const n of store.value.tavernHelper.scripts) m.set(n.id, n)
  return m
})
function getScript(id: string): Script | undefined {
  const n = scriptsById.value.get(id)
  return n && n.type === 'script' ? n as Script : undefined
}
function getFolder(id: string): ScriptFolder | undefined {
  const n = scriptsById.value.get(id)
  return n && n.type === 'folder' ? n as ScriptFolder : undefined
}
function isFolder(id: string): boolean {
  const n = scriptsById.value.get(id)
  return n != null && n.type === 'folder'
}

function nodeKey(node: FlatNode, gi: number) {
  return node.isGroup ? (node.ref as OrderGroup).id : (node.ref as OrderItem).identifier + '_' + gi
}
function itemStyle(node: FlatNode) {
  return node.depth > 0 ? { paddingLeft: (8 + node.depth * 16) + 'px' } : {}
}
function unbindCurrent() {
  const s = store.value
  const groupGi = Array.from(s.scriptTreeSelectedGi).find(gi => {
    const node = s.scriptTreeFlatNodes[gi]
    return node?.isGroup ?? false
  })
  if (groupGi === undefined) return
  s.scriptTreeUnbindGroup(groupGi)
}

/** 分组名就地编辑（useInlineRename）。提交时同步组名回 _gname 字段。 */
const {
  editingId: editingGroupGi,
  setInputRef: setGroupNameInputRaw,
  start: startEditGroupNameRaw,
  finish: finishEditGroupName,
  cancel: cancelEditGroupName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.value.scriptTreeFlatNodes[gi]
    return node && node.isGroup ? (node.ref as OrderGroup).name : ''
  },
  onCommit: (gi, newName) => {
    const s = store.value
    const node = s.scriptTreeFlatNodes[gi]
    if (!node || !node.isGroup) return
    (node.ref as OrderGroup).name = newName
    // sync _gname 回所有属于该组的 script
    const gid = (node.ref as OrderGroup)._gid
    s.tavernHelper.scripts.forEach((n: ScriptTree) => {
      if (n.type === 'script' && (n as Script)._gid === gid) (n as Script)._gname = newName
    })
    s.markDirty()
  },
})
function setGroupNameInput(el: any, _gi: number) { setGroupNameInputRaw(el) }
function startEditGroupName(gi: number) {
  const node = store.value.scriptTreeFlatNodes[gi]
  if (!node || !node.isGroup) return
  startEditGroupNameRaw(gi)
}

/** folder 名就地编辑（顶层 OrderItem，identifier = folder.id）。提交时写 folder.name + markDirty。 */
const {
  editingId: editingFolderGi,
  setInputRef: setFolderNameInputRaw,
  start: startEditFolderNameRaw,
  finish: finishEditFolderName,
  cancel: cancelEditFolderName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.value.scriptTreeFlatNodes[gi]
    if (!node || node.isGroup) return ''
    const item = node.ref as OrderItem
    return getFolder(item.identifier)?.name || ''
  },
  onCommit: (gi, newName) => {
    const s = store.value
    const node = s.scriptTreeFlatNodes[gi]
    if (!node || node.isGroup) return
    const item = node.ref as OrderItem
    const folder = getFolder(item.identifier)
    if (!folder) return
    folder.name = newName
    s.markDirty()
  },
})
function setFolderNameInput(el: any, _gi: number) { setFolderNameInputRaw(el) }
function startEditFolderName(gi: number) {
  const node = store.value.scriptTreeFlatNodes[gi]
  if (!node || node.isGroup) return
  const item = node.ref as OrderItem
  if (!isFolder(item.identifier)) return
  startEditFolderNameRaw(gi)
}

/** script 名就地编辑（叶子节点，identifier = script.id）。提交时写 script.name + renameTab + markDirty。 */
const {
  editingId: editingScriptGi,
  setInputRef: setScriptNameInputRaw,
  start: startEditScriptNameRaw,
  finish: finishEditScriptName,
  cancel: cancelEditScriptName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.value.scriptTreeFlatNodes[gi]
    if (!node || node.isGroup) return ''
    const item = node.ref as OrderItem
    return getScript(item.identifier)?.name || ''
  },
  onCommit: (gi, newName) => {
    const s = store.value
    const node = s.scriptTreeFlatNodes[gi]
    if (!node || node.isGroup) return
    const item = node.ref as OrderItem
    const script = getScript(item.identifier)
    if (!script) return
    script.name = newName
    s.markDirty()
    tabsStore.renameTab('tavern', item.identifier, newName)
  },
})
function setScriptNameInput(el: any, _gi: number) { setScriptNameInputRaw(el) }
function startEditScriptName(gi: number) {
  const node = store.value.scriptTreeFlatNodes[gi]
  if (!node || node.isGroup) return
  const item = node.ref as OrderItem
  if (isFolder(item.identifier)) return
  startEditScriptNameRaw(gi)
}

function onGroupToggle(gi: number) {
  store.value.scriptTreeToggleGroupCollapse(gi)
}

/** 新建脚本：调 store.addScriptTree，打开对应标签。 */
function onAdd() {
  const s = store.value
  const id = s.addScriptTree()
  if (!id) return
  const script = s.tavernHelper.scripts.find((n: ScriptTree) => n.id === id) as Script | undefined
  tabsStore.open({ domain: 'tavern', key: id, label: script?.name || uiStore.t('common.unnamed'), workspace: workspace.value })
}

/** 删除单个脚本/folder（叶子节点）：confirmStore 确认后调 store.deleteScriptTree + close tab。 */
function onDeleteBlock(gi: number) {
  const s = store.value
  const node = s.scriptTreeFlatNodes[gi]
  if (!node || node.isGroup) return
  const item = node.ref as OrderItem
  const tree = s.tavernHelper.scripts.find((n: ScriptTree) => n.id === item.identifier)
  if (!tree) return
  const name = (tree.type === 'folder' ? (tree as ScriptFolder).name : (tree as Script).name) || tree.id
  confirmStore.ask({
    title: uiStore.t('tavern.confirm.delete.title'),
    message: uiStore.t('tavern.confirm.delete.message', { name: esc(name) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => { s.deleteScriptTree(tree.id); tabsStore.close('tavern', tree.id) },
  })
}

/** 删除分组（组节点）：confirmStore 确认后摘组 + 删全部子脚本 + 关 tab。
 *  不用 store.scriptTreeRemoveNode（那是 useGroupedList 纯树原语，不碰 scripts 数组/tabsStore）。 */
function onDeleteGroup(gi: number) {
  const s = store.value
  const node = s.scriptTreeFlatNodes[gi]
  if (!node || !node.isGroup) return
  const group = node.ref as OrderGroup
  const childIds = group.children.map(c => c.identifier)
  confirmStore.ask({
    title: uiStore.t('tavern.confirm.delete.title'),
    message: uiStore.t('tavern.confirm.delete.message', { name: esc(group.name) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => {
      s.scriptTreeRemoveNode(gi)
      childIds.forEach(id => { s.deleteScriptTree(id); tabsStore.close('tavern', id) })
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
  domain: 'tavern',
  itemEls,
  keyOf: () => {
    const tab = tabsStore.activeTab
    if (!tab) return null
    const gi = store.value.scriptTreeIdentifierToGi(tab.key)
    return gi >= 0 ? gi : null
  },
})

/** 拖放落点：直接交给 store.reorderScriptTreeBlock 处理分组插入语义。 */
function onDragDrop(from: number, to: number, after: boolean) {
  store.value.reorderScriptTreeBlock(from, to, after)
}

/** 标签驱动侧边栏选中态：activeTab 变化时展开目标所在折叠组 + 重置 selectedGi/anchorGi 成单行。
 *  这是"点 tab/reload 后高亮切到新行"的唯一实现——漏接这个 watcher 的话点 tab 只切编辑区内容，
 *  sidebar 选中态没跟着重置（旧 selectedGi 残留 → reload 高亮持续）。同 PresetSidebar/RegexSidebar 模式。 */
watch(() => tabsStore.activeTab, (tab) => {
  if (!tab || tab.domain !== 'tavern' || tab.workspace !== workspace.value) {
    store.value.scriptTreeClearSelection()
    return
  }
  const gi = store.value.scriptTreeRevealAndFindGi(tab.key)
  if (gi < 0) return
  // 幂等守卫：高亮实际不变时不给侧边栏 v-for 新 Set 引用（缺这个守卫每次切 tab 都换新 Set →
  // 整个 sidebar v-for 全量重渲染 → 每节点 getScript/getFolder/isFolder 对 tavernHelper.scripts 做
  // O(n) 线性 find/some → O(n²) 响应式属性访问 → 大脚本树下秒级卡死）。同 presetStore 范本。
  if (store.value.scriptTreeAnchorGi === gi
      && store.value.scriptTreeSelectedGi.size === 1
      && store.value.scriptTreeSelectedGi.has(gi)) return
  store.value.scriptTreeSelectedGi = new Set([gi])
  store.value.scriptTreeAnchorGi = gi
}, { immediate: true, flush: 'sync' })

/**
 * 列表选择（同 RegexSidebar 模式）：
 * - 多选（ctrl/shift/长按）走 store.scriptTreeSelectBlock；
 * - 普通点击：本地清空选中并只选当前行，点组标题切换折叠，点脚本/folder 打开对应标签。
 */
const listSelection = useListSelection<number>({
  onSelect: (mode, gi) => {
    const s = store.value
    if (mode !== 'single') {
      s.scriptTreeSelectBlock(gi, { ctrl: mode === 'ctrl', shift: mode === 'shift' })
      return
    }
    const node = s.scriptTreeFlatNodes[gi]
    if (!node) return
    s.scriptTreeSelectedGi.clear()
    s.scriptTreeSelectedGi.add(gi)
    s.scriptTreeAnchorGi = gi
    if (node.isGroup) {
      s.scriptTreeToggleGroupCollapse(gi)
    } else {
      const item = node.ref as OrderItem
      const tree = s.tavernHelper.scripts.find((n: ScriptTree) => n.id === item.identifier)
      const label = tree?.name || item.identifier
      tabsStore.open({ domain: 'tavern', key: item.identifier, label, workspace: workspace.value })
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
  if (!store.value.scriptTreeFlatNodes[gi]) return
  listSelection.onClick(gi, e)
}
</script>
