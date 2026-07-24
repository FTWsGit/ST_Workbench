<template>
  <div class="wb-editor-panel" v-if="!tabsStore.activeTab">
    <div class="wb-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarMode === 'regex'">{{ store.t('shared.editorShell.emptyRegex') }}</p>
      <p v-else-if="store.hasData">{{ store.t('shared.editorShell.emptyBlock') }}</p>
      <p v-else>{{ store.t('shared.editorShell.loading') }}</p>
    </div>
  </div>
  <PresetContentEditor v-else-if="tabsStore.activeTab.domain === 'preset'" />
  <RegexContentEditor v-else-if="tabsStore.activeTab.domain === 'regex'" />
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { useTabsStore } from '../../stores/tabsStore'
import PresetContentEditor from '../preset/PresetContentEditor.vue'
import RegexContentEditor from '../regex/RegexContentEditor.vue'

const store = usePresetStore()
const tabsStore = useTabsStore()
</script>
