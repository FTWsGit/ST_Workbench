<template>
  <div class="wb-editor-panel rx-editor" v-if="entry">
    <div class="wb-editor-meta">
      <span class="rx-editor-name">{{ entry.comment || store.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: tabsStore.settingsDockOpen }" @click="tabsStore.toggleSettingsDock()" :title="store.t('regex.editor.settingsPanel')">⚙</button>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :placeholder="store.t('worldbook.editor.placeholder')"
      :status-cursor-label="store.t('shared.highlightedEditor.cursor')"
      :status-chars-label="store.t('common.chars')"
      :status-lines-label="store.t('common.lines')" />
  </div>
</template>

<script setup lang="ts">
/* 世界书内容编辑器——不像 RegexContentEditor 那样有正则测试栏，条目内容就是纯文本，比正则脚本
 * 简单（没有 preview/HTML 渲染那层）。不参数化，直接 useWorldbookStore()，见
 * WorldbookSidebar.vue 顶部同样的理由。 */
import { ref, computed, watch } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useTabsStore } from '../../stores/tabsStore'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = useWorldbookStore()
const tabsStore = useTabsStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

const entry = computed(() => store.currentEntry)

// v-model bridge，跟 PresetContentEditor.vue 的 content 计算属性同一个模式：entries 数组本身
// 只做浅监听（见 worldbookStore.ts 顶部 doc comment），nested 字段变化不会自动触发 dirty，这里
// 显式 markDirty()。
const contentModel = computed<string>({
  get: () => entry.value?.content ?? '',
  set: (v) => { if (entry.value) { entry.value.content = v; store.markDirty() } },
})

watch(() => [store.settings.editorFontSize, store.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
