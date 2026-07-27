<template>
  <div class="wb-editor-panel" v-if="!tabsStore.activeTab">
    <div class="wb-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarMode === 'regex'">{{ uiStore.t('regex.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.sidebarMode === 'worldbook'">{{ worldbookStore.hasData ? uiStore.t('worldbook.editorShell.emptyEntry') : uiStore.t('worldbook.editorShell.empty') }}</p>
      <p v-else-if="tabsStore.sidebarMode === 'character'">{{ characterStore.hasData ? uiStore.t('character.editorShell.emptyField') : uiStore.t('character.editorShell.empty') }}</p>
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

/** domain === 'regex' 标签可能归属两个不同工作区（预设自己的正则 / 角色卡自己的正则，见
 *  tabsStore.ts OpenTab.workspace 的 doc comment 和 CharacterSidebar.vue 顶部 doc comment），
 *  数据源按 activeTab.workspace 分派，不再硬编码 presetStore——这是 RegexContentEditor.vue
 *  参数化改造（TODO.md 阶段0）之后，第一个真正利用"数据源可以不是 presetStore"这一点的调用方。 */
const regexScripts = computed(() =>
  tabsStore.activeTab?.workspace === 'character' ? characterStore.regexScripts : presetStore.regexScripts
)
</script>
