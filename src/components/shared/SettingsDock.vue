<template>
  <div v-if="formComponent && tabsStore.settingsDockOpen" class="wb-right-panel wb-settings-dock" :class="{ float: store.settings.settingsDockFloat }" :style="{ width: store.settings.settingsDockWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ store.t('shared.settingsDock.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: store.settings.settingsDockFloat }" :title="store.t('shared.settingsDock.toggleFloat')" @click="toggleFloat">📌</button>
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
import { useTabsStore } from '../../stores/tabsStore'
import { usePanelResize } from '../../composables/usePanelResize'
import RegexSettingsForm from '../regex/RegexSettingsForm.vue'
import PresetSettingsForm from '../preset/PresetSettingsForm.vue'
import WorldbookSettingsForm from '../worldbook/WorldbookSettingsForm.vue'

const store = usePresetStore()
const tabsStore = useTabsStore()
// Domain -> settings-form component routing table (see PROJECT_HANDOFF.md 架构总览 2). Adding a
// new domain's settings form is just one more entry here — this component never needs to know
// what's actually inside each form. worldbook 跟 preset 一样没参数化，自己 useWorldbookStore()，
// 不需要在下面 formProps 里喂任何东西。
const FORMS: Record<string, any> = { regex: RegexSettingsForm, preset: PresetSettingsForm, worldbook: WorldbookSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

/** RegexSettingsForm.vue 参数化改造后（见 regexProps.ts）不再自己 import presetStore，这里的
 *  <component :is> 是动态挂载点，得自己知道当前挂的是哪个表单、该喂给它什么 props。
 *  PresetSettingsForm 还没参数化（不在这次 TODO 范围内），继续自己硬编 usePresetStore()，
 *  这里给它传空对象即可（Vue 会把未声明的 props 当 fallthrough attrs 挂到根元素上，传空对象
 *  就不会有任何 fallthrough，等同于以前"不传任何东西"的效果）。 */
const formProps = computed<Record<string, any>>(() => {
  if (tabsStore.activeTab?.domain === 'regex') {
    return { scripts: store.regexScripts, workspace: 'preset', t: store.t }
  }
  return {}
})

const resize = usePanelResize({
  getWidth: () => store.settings.settingsDockWidth,
  setWidth: (w) => { store.settings.settingsDockWidth = w },
  min: 240, max: 520, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })
function toggleFloat() { store.settings.settingsDockFloat = !store.settings.settingsDockFloat; store.saveSettings() }
</script>
