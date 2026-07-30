<template>
  <aside class="wb-sidebar" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: props.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ props.t('regex.sidebar.title', { count: props.scripts.length }) }}</span>
      <ListToolbar>
        <button class="wb-btn" @click="onAdd">{{ props.t('regex.sidebar.newScript') }}</button>
      </ListToolbar>
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

/** 激活项滚动同步：通过 tabsStore.open/focus 触发时把对应项滚入视图；keyOf 把脚本 id 解析为列表索引。 */
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
