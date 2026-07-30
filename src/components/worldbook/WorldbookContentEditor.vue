<template>
  <div class="wb-editor-panel rx-editor" v-if="entry">
    <div class="wb-editor-meta">
      <span class="rx-editor-name">{{ entry.comment || uiStore.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: tabsStore.settingsDockOpen }" @click="tabsStore.toggleSettingsDock()" :title="uiStore.t('regex.editor.settingsPanel')">⚙</button>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :placeholder="uiStore.t('worldbook.editor.placeholder')"
      :status-cursor-label="uiStore.t('shared.highlightedEditor.cursor')"
      :status-chars-label="uiStore.t('common.chars')"
      :status-lines-label="uiStore.t('common.lines')" />
  </div>
</template>

<script setup lang="ts">
/** 世界书内容编辑器：条目内容为纯文本（无正则测试栏/HTML 预览）。不参数化，直接 useWorldbookStore()。 */
import { ref, computed, watch } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = useWorldbookStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

const entry = computed(() => store.currentEntry)

/** entry.content 的 v-model 桥接；entries 浅监听，nested 字段变化需显式 markDirty()。 */
const contentModel = computed<string>({
  get: () => entry.value?.content ?? '',
  set: (v) => { if (entry.value) { entry.value.content = v; store.markDirty() } },
})

watch(() => [uiStore.settings.editorFontSize, uiStore.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
