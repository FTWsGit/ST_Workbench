<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('character.sidebar.title') }}</span>
    </div>
    <div class="wb-list" ref="listRef">
      <p v-if="!store.hasData" class="wb-preset-cp-empty">{{ uiStore.t('character.sidebar.empty') }}</p>
      <template v-else>
        <div class="wb-list-section-label">{{ uiStore.t('character.sidebar.fieldsLabel') }}</div>
        <div v-for="f in CHARACTER_FIELDS" :key="f.key"
             class="wb-tree-item"
             :class="{ selected: tabsStore.activeId === 'character:field:' + f.key }"
             @click="openField(f.key)">
          <span class="wb-tree-name">{{ uiStore.t(f.labelKey) }}</span>
        </div>

        <div class="wb-list-section-header">
          <span class="wb-list-section-label">{{ uiStore.t('character.sidebar.greetingsLabel') }}</span>
          <button class="wb-btn sm" @click="store.addGreeting()">{{ uiStore.t('character.sidebar.addGreeting') }}</button>
        </div>
        <div v-for="(g, i) in store.character?.greetings ?? []" :key="store.greetingIds[i]"
             :ref="(el) => setItemRef(el, i)"
             class="wb-tree-item"
             :class="{ selected: tabsStore.activeId === 'character:field:greeting:' + store.greetingIds[i],
                       dragging: dragIdx === i,
                       'drag-over-top': dragOverIdx === i && dragOverPos === 'top',
                       'drag-over-bottom': dragOverIdx === i && dragOverPos === 'bottom' }"
             @pointerdown="onDragStart(i, $event)"
             @click="onGreetingClick(i)">
          <span class="wb-drag-handle">⠿</span>
          <span class="wb-tree-name">{{ uiStore.t('character.sidebar.greetingLabel', { n: i + 1 }) }}</span>
          <span class="wb-tree-actions">
            <span class="wb-tree-act del" :title="uiStore.t('character.sidebar.deleteGreetingTitle')" @click.stop="store.deleteGreeting(store.greetingIds[i])">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
</template>

<script setup lang="ts">
/** 角色卡侧边栏：固定字段（CHARACTER_FIELDS，不可拖拽）+ greetings（可拖拽排序，复用 useDragReorder 按下标用法）。
 *  不接多选（useListSelection），两类列表均无批量操作语义。
 *  fields|regex 子切换已上移到 App.vue 顶栏（wb-collection-switch），由 sidebarCollection 决定挂载本组件还是 RegexSidebar（workspace='character'）。 */
import { ref, watch } from 'vue'
import { useCharacterStore } from '../../stores/characterStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { CHARACTER_FIELDS } from '../../types'
import { useDragReorder } from '../../composables/useDragReorder'
import { usePanelResize } from '../../composables/usePanelResize'

const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const store = useCharacterStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()
const listRef = ref<HTMLElement>()

function openField(key: string) {
  const field = CHARACTER_FIELDS.find(f => f.key === key)
  tabsStore.open({ domain: 'character', key: 'field:' + key, label: field ? uiStore.t(field.labelKey) : key, workspace: 'character' })
}

const { dragIdx, dragOverIdx, dragOverPos, setItemRef, onItemMouseDown, consumeSuppressClick } =
  useDragReorder<number>({ autoScrollContainer: () => listRef.value })

function onDragStart(i: number, e: PointerEvent) {
  onItemMouseDown(i, e, (from, to, after) => store.reorderGreeting(from, to, after))
}
function onGreetingClick(i: number) {
  if (consumeSuppressClick()) return
  const id = store.greetingIds[i]
  if (!id) return
  tabsStore.open({ domain: 'character', key: 'field:greeting:' + id, label: uiStore.t('character.sidebar.greetingLabel', { n: i + 1 }), workspace: 'character' })
}

const resize = usePanelResize({
  getWidth: () => uiStore.settings.sidebarWidth,
  setWidth: (w) => { uiStore.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })
</script>
