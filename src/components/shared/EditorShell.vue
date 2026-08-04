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

/** 各编辑组件的 props：host-dependent domain（regex/tavern）通过 tabsStore 的适配器注册表拿数据，
 *  不再直接 import presetStore/characterStore；其余组件自管 store，传空对象即可。
 *  adapter.scripts 是 getter 函数——调用时建立响应式追踪，拿到最新的、已 unwrap 的数组。 */
const editorProps = computed<Record<string, any>>(() => {
  const tab = tabsStore.activeTab
  if (!tab) return {}
  if (tab.domain === 'regex' || tab.domain === 'tavern') {
    const adapter = tabsStore.getDomainAdapter(tab.domain, tab.workspace)
    if (!adapter) return {}
    return {
      scripts: adapter.scripts(),
      workspace: adapter.workspace,
      t: adapter.t,
      'editor-font-size': uiStore.settings.editorFontSize,
      'editor-font-family': uiStore.settings.editorFontFamily,
    }
  }
  return {}
})
</script>
