<template>
  <div v-if="formComponent && tabsStore.settingsDockOpen" class="wb-right-panel wb-settings-dock" :class="{ float: uiStore.settings.settingsDockFloat }" :style="{ width: uiStore.settings.settingsDockWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('shared.settingsDock.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.settingsDockFloat }" :title="uiStore.t('shared.settingsDock.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" @click="tabsStore.settingsDockOpen = false">✕</button>
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
// Domain -> settings-form component routing table (see PROJECT_HANDOFF.md 架构总览 2). Adding a
// new domain's settings form is just one more entry here — this component never needs to know
// what's actually inside each form. worldbook 跟 preset 一样没参数化，自己 useWorldbookStore()，
// 不需要在下面 formProps 里喂任何东西。
// 故意不加 'character' 条目（TODO.md 2.4）——查不到时 formComponent 是 undefined，下面
// v-if="formComponent" 自动隐藏整个面板，角色卡 tab 激活时右侧设置面板消失不需要额外处理。
const FORMS: Record<string, any> = { regex: RegexSettingsForm, preset: PresetSettingsForm, worldbook: WorldbookSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

/** RegexSettingsForm.vue 参数化改造后（见 regexProps.ts）不再自己 import presetStore，这里的
 *  <component :is> 是动态挂载点，得自己知道当前挂的是哪个表单、该喂给它什么 props。domain==='regex'
 *  的数据源按 activeTab.workspace 分派（跟 EditorShell.vue 的 regexScripts computed 同一个理由：
 *  正则标签可能归属预设工作区也可能归属角色工作区，不能再假设一定是 presetStore）。
 *  PresetSettingsForm 还没参数化（不在这次 TODO 范围内），继续自己硬编 usePresetStore()，
 *  这里给它传空对象即可（Vue 会把未声明的 props 当 fallthrough attrs 挂到根元素上，传空对象
 *  就不会有任何 fallthrough，等同于以前"不传任何东西"的效果）。 */
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
  min: 240, max: 520, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })
function toggleFloat() { uiStore.settings.settingsDockFloat = !uiStore.settings.settingsDockFloat; uiStore.saveSettings() }
</script>
