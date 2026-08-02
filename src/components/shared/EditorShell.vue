<template>
  <div class="wb-editor-panel" v-if="!tabsStore.activeTab">
    <div class="wb-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarCollection === 'regex'">{{ uiStore.t('regex.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.sidebarCollection === 'tavern'">{{ uiStore.t('tavern.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.activeWorkspace === 'worldbook'">{{ worldbookStore.hasData ? uiStore.t('worldbook.editorShell.emptyEntry') : uiStore.t('worldbook.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.activeWorkspace === 'character'">{{ characterStore.hasData ? uiStore.t('character.editorShell.emptyField') : uiStore.t('character.editorShell.empty') }}</p>
      <p v-else-if="presetStore.hasData">{{ uiStore.t('preset.editorShell.empty') }}</p>
      <p v-else>{{ uiStore.t('preset.editorShell.loading') }}</p>
    </div>
  </div>
  <component v-else :is="editorComponent" v-bind="editorProps" />
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
import TavernContentEditor from '../tavern/TavernContentEditor.vue'

const presetStore = usePresetStore()
const uiStore = useUiStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()
const tabsStore = useTabsStore()

/** domain → 编辑组件路由表；新增 domain 只需加一行。 */
const EDITOR_COMPONENTS: Record<string, any> = {
  preset: PresetContentEditor,
  regex: RegexContentEditor,
  worldbook: WorldbookContentEditor,
  character: CharacterContentEditor,
  tavern: TavernContentEditor,
}
const editorComponent = computed(() => tabsStore.activeTab ? EDITOR_COMPONENTS[tabsStore.activeTab.domain] : null)

/** 各编辑组件的 props：regex 按 activeTab.workspace 分派数据源（preset/character）；其余组件自管 store，传空对象即可。 */
const editorProps = computed<Record<string, any>>(() => {
  if (tabsStore.activeTab?.domain === 'regex') {
    const workspace = tabsStore.activeTab.workspace
    const scripts = workspace === 'character' ? characterStore.regexScripts : presetStore.regexScripts
    return {
      scripts,
      workspace,
      t: uiStore.t,
      'editor-font-size': uiStore.settings.editorFontSize,
      'editor-font-family': uiStore.settings.editorFontFamily,
    }
  }
  if (tabsStore.activeTab?.domain === 'tavern') {
    const workspace = tabsStore.activeTab.workspace
    const scripts = workspace === 'character' ? characterStore.tavernHelper.scripts : presetStore.tavernHelper.scripts
    return {
      scripts,
      workspace,
      t: uiStore.t,
      'editor-font-size': uiStore.settings.editorFontSize,
      'editor-font-family': uiStore.settings.editorFontFamily,
    }
  }
  return {}
})
</script>
