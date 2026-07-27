<template>
  <template v-if="localMode === 'fields'">
    <aside class="wb-sidebar" ref="sidebarRef" :class="{ 'wb-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: uiStore.settings.sidebarWidth + 'px' }">
      <div class="wb-sidebar-header">
        <span>{{ uiStore.t('character.sidebar.title') }}</span>
        <div class="wb-sidebar-tools">
          <button class="wb-btn sm" @click="localMode = 'regex'">{{ uiStore.t('character.sidebar.regexMode') }}</button>
        </div>
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

  <RegexSidebar v-else
    :mobile-drawer-open="props.mobileDrawerOpen"
    :scripts="store.regexScripts" workspace="character" :t="uiStore.t"
    :on-add="store.addRegexScript" :on-delete="store.deleteRegexScript" :on-reorder="store.reorderRegexScript"
    :sidebar-width="uiStore.settings.sidebarWidth"
    :on-sidebar-width-change="(w) => { uiStore.settings.sidebarWidth = w }"
    :on-sidebar-width-commit="uiStore.saveSettings">
    <template #modeToggle>
      <div class="wb-sidebar-tools">
        <button class="wb-btn sm" @click="localMode = 'fields'">{{ uiStore.t('character.sidebar.fieldsMode') }}</button>
      </div>
    </template>
  </RegexSidebar>
</template>

<script setup lang="ts">
/* 角色卡侧边栏（TODO.md 2.2）——故意不复用 PresetSidebar 那套 flatNodes/gi 坐标系和分组：固定
 * 字段永远按 CHARACTER_FIELDS 预定义顺序展示、不可拖拽、不分组；只有 greetings 支持拖拽，用
 * useDragReorder<number>（跟 RegexSidebar 同款按数组下标的用法，不是 gi），也不接多选
 * （useListSelection）——角色卡侧边栏的两类列表都不需要"选中一批做批量操作"这个语义。
 *
 * fields|regex 子切换（characterSidebarMode，TODO.md 1.5/1.6）故意不是 tabsStore.sidebarMode
 * 的又一个顶层值，而是这个组件自己的本地状态：预设工作区的 preset|regex 子切换维持原样不受影响
 * （TODO.md 1.5 "行为跟现在完全一样"），角色工作区的 regex 子模式复用同一套参数化后的 RegexSidebar
 * 组件（RegexSidebar.vue 新加的 #modeToggle 具名插槽只有这里会传内容），指向
 * characterStore.regexScripts + workspace: 'character'，EditorShell.vue/SettingsDock.vue 那边则是
 * 按 tabsStore.activeTab.workspace 分派到 characterStore 还是 presetStore（见那两个文件的改动）。 */
import { ref, watch } from 'vue'
import { useCharacterStore } from '../../stores/characterStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { CHARACTER_FIELDS } from '../../types'
import { useDragReorder } from '../../composables/useDragReorder'
import { usePanelResize } from '../../composables/usePanelResize'
import RegexSidebar from '../regex/RegexSidebar.vue'

const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const store = useCharacterStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()
const listRef = ref<HTMLElement>()

const localMode = ref<'fields' | 'regex'>('fields')

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
