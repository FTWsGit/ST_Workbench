<template>
  <div class="wb-editor-panel" v-if="!tabsStore.activeTab">
    <div class="wb-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarMode === 'regex'">{{ uiStore.t('shared.editorShell.emptyRegex') }}</p>
      <p v-else-if="tabsStore.sidebarMode === 'worldbook'">{{ worldbookStore.hasData ? uiStore.t('shared.editorShell.emptyWorldbookEntry') : uiStore.t('shared.editorShell.emptyWorldbook') }}</p>
      <p v-else-if="presetStore.hasData">{{ uiStore.t('shared.editorShell.emptyBlock') }}</p>
      <p v-else>{{ uiStore.t('shared.editorShell.loading') }}</p>
    </div>
  </div>
  <PresetContentEditor v-else-if="tabsStore.activeTab.domain === 'preset'" />
  <RegexContentEditor v-else-if="tabsStore.activeTab.domain === 'regex'"
    :scripts="presetStore.regexScripts" workspace="preset" :t="uiStore.t"
    :editor-font-size="uiStore.settings.editorFontSize" :editor-font-family="uiStore.settings.editorFontFamily" />
  <WorldbookContentEditor v-else-if="tabsStore.activeTab.domain === 'worldbook'" />
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useTabsStore } from '../../stores/tabsStore'
import PresetContentEditor from '../preset/PresetContentEditor.vue'
import RegexContentEditor from '../regex/RegexContentEditor.vue'
import WorldbookContentEditor from '../worldbook/WorldbookContentEditor.vue'

const presetStore = usePresetStore()
const uiStore = useUiStore()
const worldbookStore = useWorldbookStore()
const tabsStore = useTabsStore()
</script>
