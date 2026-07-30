<template>
  <div class="wb-editor-panel" v-if="!tabsStore.activeTab">
    <div class="wb-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarCollection === 'regex'">{{ uiStore.t('regex.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.activeWorkspace === 'worldbook'">{{ worldbookStore.hasData ? uiStore.t('worldbook.editorShell.emptyEntry') : uiStore.t('worldbook.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.activeWorkspace === 'character'">{{ characterStore.hasData ? uiStore.t('character.editorShell.emptyField') : uiStore.t('character.editorShell.empty') }}</p>
      <p v-else-if="presetStore.hasData">{{ uiStore.t('preset.editorShell.empty') }}</p>
      <p v-else>{{ uiStore.t('preset.editorShell.loading') }}</p>
    </div>
  </div>
  <PresetContentEditor v-else-if="tabsStore.activeTab.domain === 'preset'" />
  <RegexContentEditor v-else-if="tabsStore.activeTab.domain === 'regex'"
    :scripts="regexScripts" :workspace="tabsStore.activeTab.workspace" :t="uiStore.t"
    :editor-font-size="uiStore.settings.editorFontSize" :editor-font-family="uiStore.settings.editorFontFamily" />
  <WorldbookContentEditor v-else-if="tabsStore.activeTab.domain === 'worldbook'" />
  <CharacterContentEditor v-else-if="tabsStore.activeTab.domain === 'character'" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useTabsStore } from '../../stores/tabsStore'
import PresetContentEditor from '../preset/PresetContentEditor.vue'
import RegexContentEditor from '../regex/RegexContentEditor.vue'
import WorldbookContentEditor from '../worldbook/WorldbookContentEditor.vue'
import CharacterContentEditor from '../character/CharacterContentEditor.vue'

const presetStore = usePresetStore()
const uiStore = useUiStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()
const tabsStore = useTabsStore()

/** domain='regex' 的数据源按 activeTab.workspace 分派（预设正则 / 角色卡正则），不再硬编码 presetStore。 */
const regexScripts = computed(() =>
  tabsStore.activeTab?.workspace === 'character' ? characterStore.regexScripts : presetStore.regexScripts
)
</script>
