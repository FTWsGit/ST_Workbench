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
import { usePresetStore } from '../../stores/presetStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { usePanelResize } from '../../composables/usePanelResize'
import RegexSettingsForm from '../regex/RegexSettingsForm.vue'
import PresetSettingsForm from '../preset/PresetSettingsForm.vue'
import WorldbookSettingsForm from '../worldbook/WorldbookSettingsForm.vue'

const presetStore = usePresetStore()
const characterStore = useCharacterStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()

/** domain -> 设置表单组件路由表；新增 domain 只需加一项。未列出的 domain（如 character）formComponent 为 undefined，面板自动隐藏。 */
const FORMS: Record<string, any> = { regex: RegexSettingsForm, preset: PresetSettingsForm, worldbook: WorldbookSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

/** 根据当前 domain 组装动态表单的 props：regex 按 activeTab.workspace 分派数据源（preset/character）；其余表单目前自管 store，传空对象即可。 */
const formProps = computed<Record<string, any>>(() => {
  if (tabsStore.activeTab?.domain === 'regex') {
    const workspace = tabsStore.activeTab.workspace
    const scripts = workspace === 'character' ? characterStore.regexScripts : presetStore.regexScripts
    return { scripts, workspace, t: uiStore.t }
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
