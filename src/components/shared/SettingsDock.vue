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
      <component :is="formComponent" />
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

const store = usePresetStore()
const tabsStore = useTabsStore()
// Domain -> settings-form component routing table (see PROJECT_HANDOFF.md 架构总览 2). Adding a
// new domain's settings form is just one more entry here — this component never needs to know
// what's actually inside each form.
const FORMS: Record<string, any> = { regex: RegexSettingsForm, preset: PresetSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

const resize = usePanelResize({
  getWidth: () => store.settings.settingsDockWidth,
  setWidth: (w) => { store.settings.settingsDockWidth = w },
  min: 240, max: 520, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })
function toggleFloat() { store.settings.settingsDockFloat = !store.settings.settingsDockFloat; store.saveSettings() }
</script>
