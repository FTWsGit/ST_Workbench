<template>
  <aside class="wb-sidebar" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: props.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ props.t('regex.sidebar.title', { count: props.scripts.length }) }}</span>
      <ListToolbar :count="props.scripts.length">
        <button class="wb-btn" @click="onAdd">{{ props.t('regex.sidebar.newScript') }}</button>
      </ListToolbar>
      <!-- 空插槽，预设工作区（App.vue 挂载点）不传内容时什么都不渲染，行为跟改造前完全一样。
           角色工作区的 CharacterSidebar.vue 在 regex 子模式下用它插入一个"切回字段列表"的按钮
           （见 CharacterSidebar.vue 顶部 doc comment），这是这个组件唯一为了角色工作区新增的口子。 -->
      <slot name="modeToggle" />
    </div>
    <div class="wb-list">
      <p v-if="!props.scripts.length" class="pr-cp-empty">{{ props.t('regex.sidebar.empty') }}</p>
      <div v-for="(r, i) in props.scripts" :key="r.id"
           :ref="(el) => setItemRef(el, i)"
           class="pr-block-item"
           :class="{ selected: tabsStore.activeId === 'regex:' + r.id, disabled: r.disabled, dragging: dragIdx === i,
                     'drag-over-top': dragOverIdx === i && dragOverPos === 'top',
                     'drag-over-bottom': dragOverIdx === i && dragOverPos === 'bottom' }"
           @pointerdown="onDragStart(i, $event)"
           @click="onItemClick(i)">
        <span class="wb-drag-handle">⠿</span>
        <span class="wb-toggle-sw" :class="{ on: !r.disabled }" :title="props.t('regex.sidebar.toggleTitle')" @click.stop="r.disabled = !r.disabled"></span>
        <span class="pr-block-name">{{ r.scriptName || props.t('common.unnamed') }}</span>
        <span class="pr-block-actions">
          <span class="pr-block-act del" :title="props.t('regex.sidebar.deleteTitle')" @click.stop="onDelete(r)">🗑</span>
        </span>
      </div>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
</template>

<script setup lang="ts">
/* 正则三件套之一——参数化改造后不再 import usePresetStore()，数据源+CRUD走props，见
 * regexProps.ts 顶部的 doc comment。tabsStore 是全局单例 store，跟背后是哪个 domain store
 * 无关，继续直接用；domain 字符串 'regex' 也继续写死（这是"这个组件是什么"，不是"数据从哪来"）。*/
import { watch } from 'vue'
import { useDragReorder } from '../../composables/useDragReorder'
import { useListScrollSync } from '../../composables/useListScrollSync'
import { usePanelResize } from '../../composables/usePanelResize'
import { useTabsStore } from '../../stores/tabsStore'
import type { RegexScript } from '../../types'
import { useConfirmStore } from '../../stores/confirmStore'
import { esc } from '../../utils'
import ListToolbar from '../shared/ListToolbar.vue'
import type { RegexSidebarProps } from './regexProps'

const props = defineProps<RegexSidebarProps>()

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const { dragIdx, dragOverIdx, dragOverPos, itemEls, setItemRef, onItemMouseDown, consumeSuppressClick } = useDragReorder()

function onAdd() {
  const id = props.onAdd()
  if (!id) return
  const s = props.scripts.find(r => r.id === id)
  tabsStore.open({ domain: 'regex', key: id, label: s?.scriptName || props.t('common.unnamed'), workspace: props.workspace })
}

function onDelete(r: RegexScript) {
  confirmStore.ask({
    title: props.t('regex.confirm.delete.title'),
    message: props.t('regex.confirm.delete.message', { name: esc(r.scriptName || r.id) }),
    confirmText: props.t('common.delete'),
    cancelText: props.t('common.cancel'),
    onConfirm: () => { props.onDelete(r.id); tabsStore.close('regex', r.id) },
  })
}

function onItemClick(i: number) {
  if (consumeSuppressClick()) return
  const r = props.scripts[i]
  if (r) tabsStore.open({ domain: 'regex', key: r.id, label: r.scriptName || props.t('common.unnamed'), workspace: props.workspace })
}
function onDragStart(i: number, e: PointerEvent) {
  onItemMouseDown(i, e, (from, to, after) => props.onReorder(from, to, after))
}

// Scroll the active regex item into view whenever something asks for it (TabBar click, this
// list's own click, or anything else that goes through tabsStore.open()/focus()) — see
// useListScrollSync.ts's doc comment. itemEls (from useDragReorder) is keyed by list index, so
// keyOf resolves activeTab.key (a script id) back to that index — same lookup this file used to
// do inline before scrolling.
useListScrollSync({
  domain: 'regex',
  itemEls,
  keyOf: () => {
    const idx = props.scripts.findIndex(r => r.id === tabsStore.activeTab?.key)
    return idx >= 0 ? idx : null
  },
})

const resize = usePanelResize({
  getWidth: () => props.sidebarWidth,
  setWidth: (w) => props.onSidebarWidthChange(w),
  min: 220, max: 600, dir: 'right',
})
watch(() => resize.active.value, (v) => { if (!v) props.onSidebarWidthCommit() })
</script>
