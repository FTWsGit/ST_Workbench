<template>
  <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
    <div class="wb-sidebar-header">
      <span>{{ uiStore.t('character.sidebar.title') }}</span>
    </div>
    <div class="wb-list" ref="listRef">
      <p v-if="!store.hasData" class="pr-cp-empty">{{ uiStore.t('character.sidebar.empty') }}</p>
      <template v-else>
        <div class="wb-list-section-label">{{ uiStore.t('character.sidebar.fieldsLabel') }}</div>
        <div v-for="f in CHARACTER_FIELDS" :key="f.key"
             class="pr-block-item"
             :class="{ selected: tabsStore.activeId === 'character:field:' + f.key }"
             @click="openField(f.key)">
          <span class="pr-block-name">{{ uiStore.t(f.labelKey) }}</span>
        </div>

        <div class="wb-list-section-header">
          <span class="wb-list-section-label">{{ uiStore.t('character.sidebar.greetingsLabel') }}</span>
          <button class="wb-btn sm" @click="store.addGreeting()">{{ uiStore.t('character.sidebar.addGreeting') }}</button>
        </div>
        <div v-for="(g, i) in store.character?.greetings ?? []" :key="store.greetingIds[i]"
             :ref="(el) => setItemRef(el, i)"
             class="pr-block-item"
             :class="{ selected: tabsStore.activeId === 'character:field:greeting:' + store.greetingIds[i],
                       dragging: dragIdx === i,
                       'drag-over-top': dragOverIdx === i && dragOverPos === 'top',
                       'drag-over-bottom': dragOverIdx === i && dragOverPos === 'bottom' }"
             @pointerdown="onDragStart(i, $event)"
             @click="onGreetingClick(i)">
          <span class="wb-drag-handle">⠿</span>
          <span class="pr-block-name">{{ uiStore.t('character.sidebar.greetingLabel', { n: i + 1 }) }}</span>
          <span class="pr-block-actions">
            <span class="pr-block-act del" :title="uiStore.t('character.sidebar.deleteGreetingTitle')" @click.stop="store.deleteGreeting(store.greetingIds[i])">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="wb-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
</template>

<script setup lang="ts">
/* 角色卡侧边栏（TODO.md 2.2）——故意不复用 PresetSidebar 那套 flatNodes/gi 坐标系和分组：固定
 * 字段永远按 CHARACTER_FIELDS 预定义顺序展示、不可拖拽、不分组；只有 greetings 支持拖拽，用
 * useDragReorder<number>（跟 RegexSidebar 同款按数组下标的用法，不是 gi），也不接多选
 * （useListSelection）——角色卡侧边栏的两类列表都不需要"选中一批做批量操作"这个语义。
 *
 * 【2026-07 顶栏 IA 重构】fields|regex 子切换以前是这个组件自己的本地状态（localMode），在
 * 侧边栏头部塞一个小按钮切换、切到 regex 时整个替换成内嵌的 RegexSidebar（配一个
 * #modeToggle 具名插槽塞"返回字段"按钮）。这次改到 App.vue 顶栏第二行（wb-collection-switch）
 * 之后，这一层子切换不再需要——App.vue 直接按 tabsStore.sidebarCollection 决定挂载
 * CharacterSidebar（这个文件，只剩字段+开场白列表）还是 RegexSidebar（workspace='character'，
 * 数据源 characterStore.regexScripts，用法跟这里改动前完全一样，只是挂载点从这个组件内部搬到了
 * App.vue，和预设工作区的 regex 挂载点写法对齐——两边现在是同一种结构，不用再分别记两套逻辑）。 */
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

/* ---- Resize：跟 WorldbookSidebar/RegexSidebar 同一套 usePanelResize 用法 ---- */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.sidebarWidth,
  setWidth: (w) => { uiStore.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })
</script>
