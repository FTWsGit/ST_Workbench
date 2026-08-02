<template>
  <!-- 悬浮态：FloatingPanelShell 接管（桌面可拖拽/缩放，移动端自动变 bottom sheet）。📌 放标题槽里切回嵌入态。 -->
  <FloatingPanelShell
    v-if="uiStore.settings.toolBoxFloat"
    :title="uiStore.t('toolbox.title')"
    :close-title="uiStore.t('common.close')"
    :width="uiStore.settings.toolBoxWidth"
    :min-width="360"
    @close="closePanel"
  >
    <template #title>
      <span class="wb-toolbox-float-title">
        <span class="wb-toolbox-float-name">{{ uiStore.t('toolbox.title') }}</span>
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.toolBoxFloat }"
                :title="uiStore.t('shared.floatingPanel.toggleFloat')"
                :aria-label="uiStore.t('shared.floatingPanel.toggleFloat')"
                @pointerdown.stop @click="toggleFloat">📌</button>
      </span>
    </template>
    <div class="wb-toolbox-body">
      <div class="wb-toolbox-tabs">
        <button v-for="tool in tools" :key="tool.id" type="button" class="wb-toolbox-tab"
                :class="{ active: tool.id === activeToolId }" @click="activeToolId = tool.id">
          {{ uiStore.t(tool.labelKey) }}
        </button>
      </div>
      <p v-if="!currentTool" class="wb-muted wb-toolbox-empty">{{ uiStore.t('toolbox.empty') }}</p>
      <component :is="activeComponent" v-else v-bind="toolProps" />
    </div>
  </FloatingPanelShell>

  <!-- 嵌入态：渲染在右侧主区域边缘，带 .wb-right-resize-handle 手柄；宽度持久化到 settings.toolBoxWidth。 -->
  <div v-else class="wb-toolbox-panel" :style="{ width: uiStore.settings.toolBoxWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('toolbox.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.toolBoxFloat }"
                :title="uiStore.t('shared.floatingPanel.toggleFloat')"
                :aria-label="uiStore.t('shared.floatingPanel.toggleFloat')"
                @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" :aria-label="uiStore.t('common.close')" @click="closePanel">✕</button>
      </div>
    </div>
    <div class="wb-toolbox-body">
      <div class="wb-toolbox-tabs">
        <button v-for="tool in tools" :key="tool.id" type="button" class="wb-toolbox-tab"
                :class="{ active: tool.id === activeToolId }" @click="activeToolId = tool.id">
          {{ uiStore.t(tool.labelKey) }}
        </button>
      </div>
      <p v-if="!currentTool" class="wb-muted wb-toolbox-empty">{{ uiStore.t('toolbox.empty') }}</p>
      <component :is="activeComponent" v-else v-bind="toolProps" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { usePanelResize } from '../../composables/usePanelResize'
import FloatingPanelShell from '../shared/FloatingPanelShell.vue'
import { getToolsForScene, type ToolScene } from './registry'

const uiStore = useUiStore()
/** toolBoxOpen 按 workspace 分桶存于 tabsStore；工具箱是跨 workspace 通用的，关闭时读 activeWorkspace 而非硬编码 'preset'。 */
const tabsStore = useTabsStore()

/** 当前场景 = (activeWorkspace, sidebarCollection)。worldbook 的 sidebarCollection 由 tabsStore 兜底成 'items'。 */
const scene = computed<ToolScene>(() => ({
  workspace: tabsStore.activeWorkspace as ToolScene['workspace'],
  collection: tabsStore.sidebarCollection as ToolScene['collection'],
}))

/** 当前场景可用的工具清单（查注册表）。 */
const tools = computed(() => getToolsForScene(scene.value.workspace, scene.value.collection))

/** 当前选中的工具 id；场景切换后若旧 id 已不在清单里，回落到第一个工具。 */
const activeToolId = ref<string | null>(null)
watch(tools, (list) => {
  if (!list.some(t => t.id === activeToolId.value)) activeToolId.value = list[0]?.id ?? null
}, { immediate: true })

const currentTool = computed(() => tools.value.find(t => t.id === activeToolId.value) ?? null)
const activeComponent = computed<Component | null>(() => currentTool.value?.component ?? null)

/** 统一传给 tool 组件的 props：scene 完整对象 + workspace/collection 两个扁平字段，方便组件按需取用。 */
const toolProps = computed<Record<string, any>>(() => ({
  scene: scene.value,
  workspace: scene.value.workspace,
  collection: scene.value.collection,
}))

/** 嵌入态右边缘拖拽改宽（usePanelResize 内部已接 host window），拖完持久化。 */
const resize = usePanelResize({
  getWidth: () => uiStore.settings.toolBoxWidth,
  setWidth: (w) => { uiStore.settings.toolBoxWidth = w },
  min: 320, max: 1100, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

function toggleFloat() {
  uiStore.settings.toolBoxFloat = !uiStore.settings.toolBoxFloat
  uiStore.saveSettings()
}

function closePanel() {
  tabsStore.setToolBoxOpen(tabsStore.activeWorkspace, false)
}
</script>
