<template>
  <div class="wb-editor-panel wb-tavern-editor" v-if="script">
    <div class="wb-editor-meta">
      <span class="wb-tavern-editor-name">{{ script.name || props.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: uiStore.settingsDockOpen }" @click="uiStore.toggleSettingsDock()" :title="props.t('tavern.editor.settingsPanel')">⚙</button>
    </div>
    <HighlightedEditor v-model="contentModel"
      :placeholder="props.t('tavern.editor.placeholder')"
      :status-cursor-label="props.t('shared.highlightedEditor.cursor')"
      :status-chars-label="props.t('common.chars')"
      :status-lines-label="props.t('common.lines')" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import HighlightedEditor from '../shared/HighlightedEditor.vue'
import type { Script, ScriptTree } from '../../types'
import type { TavernContentEditorProps } from './tavernProps'

const props = defineProps<TavernContentEditorProps>()

const tabsStore = useTabsStore()
const uiStore = useUiStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

/** 当前选中 tavern 脚本（按 activeTab.key 匹配 id，只取 type='script'，folder 不进编辑器）。 */
const script = computed(() => props.scripts.find((s: ScriptTree) => s.id === tabsStore.activeTab?.key && s.type === 'script') as Script | undefined)
/** 当前选中脚本 content 的 v-model 桥接；切换标签时 getter 返回值变化，编辑器自动重渲染。 */
const contentModel = computed<string>({
  get: () => script.value?.content ?? '',
  set: (v) => { if (script.value) script.value.content = v },
})

/** 字号/字体变化不会改变 textarea 尺寸，ResizeObserver 捕捉不到，需主动 refresh。 */
watch(() => [props.editorFontSize, props.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
