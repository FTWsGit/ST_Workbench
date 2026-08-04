<template>
  <div v-if="formComponent && uiStore.settingsDockOpen" class="wb-right-panel wb-settings-dock" :class="{ float: uiStore.settings.settingsDockFloat }" :style="{ width: uiStore.settings.settingsDockWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('shared.settingsDock.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.settingsDockFloat }" :title="uiStore.t('shared.floatingPanel.toggleFloat')" :aria-label="uiStore.t('shared.floatingPanel.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" :aria-label="uiStore.t('common.close')" @click="uiStore.settingsDockOpen = false">✕</button>
      </div>
    </div>
    <div class="wb-settings-dock-body">
      <component :is="formComponent" v-bind="formProps" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { usePanelResize } from '../../composables/usePanelResize'
import RegexSettingsForm from '../regex/RegexSettingsForm.vue'
import PresetSettingsForm from '../preset/PresetSettingsForm.vue'
import WorldbookSettingsForm from '../worldbook/WorldbookSettingsForm.vue'
import TavernSettingsForm from '../tavern/TavernSettingsForm.vue'

const uiStore = useUiStore()
const tabsStore = useTabsStore()

/** domain -> 设置表单组件路由表；新增 domain 只需加一项。未列出的 domain（如 character）formComponent 为 undefined，面板自动隐藏。 */
const FORMS: Record<string, any> = { regex: RegexSettingsForm, preset: PresetSettingsForm, worldbook: WorldbookSettingsForm, tavern: TavernSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

/** host-dependent domain（regex/tavern）通过 tabsStore 的适配器注册表拿数据，
 *  不再直接 import presetStore/characterStore；其余表单目前自管 store，传空对象即可。
 *  adapter.scripts 是 getter 函数——调用时建立响应式追踪，拿到最新的、已 unwrap 的数组。 */
const formProps = computed<Record<string, any>>(() => {
  const tab = tabsStore.activeTab
  if (!tab) return {}
  if (tab.domain === 'regex' || tab.domain === 'tavern') {
    const adapter = tabsStore.getDomainAdapter(tab.domain, tab.workspace)
    if (!adapter) return {}
    return { scripts: adapter.scripts(), workspace: adapter.workspace, t: adapter.t }
  }
  return {}
})

const resize = usePanelResize({
  getWidth: () => uiStore.settings.settingsDockWidth,
  setWidth: (w) => { uiStore.settings.settingsDockWidth = w },
  min: 240, max: 600, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })
function toggleFloat() { uiStore.settings.settingsDockFloat = !uiStore.settings.settingsDockFloat; uiStore.saveSettings() }
</script>
