<template>
  <div class="wb-editor-panel">
    <div class="wb-editor-meta">
      <span class="wb-regex-editor-name">{{ store.currentBlock?.name || store.currentBlock?.identifier }}</span>
      <span v-if="store.currentBlock" class="wb-tree-role" :class="roleClass(store.currentBlock.role)">{{ store.currentBlock.role }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: uiStore.settingsDockOpen }" @click="uiStore.toggleSettingsDock()" :title="uiStore.t('preset.sidebar.settingsPanel')">⚙</button>
    </div>
    <HighlightedEditor
      ref="editorRef"
      v-model="content"
      :disabled="store.currentBlock?.marker ?? false"
      :jump="store.editorJump"
      enable-var-click
      :status-cursor-label="uiStore.t('shared.highlightedEditor.cursor')"
      :status-chars-label="uiStore.t('common.chars')"
      :status-lines-label="uiStore.t('common.lines')"
      @var-click="onVarClick"
      @var-click-miss="store.hideVarPopup()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { roleClass } from '../../utils'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = usePresetStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

/** store.currentBlock.content 的 v-model 桥接；set 里显式 markDirty()，prompts 改为浅监听以避免每字遍历。 */
const content = computed<string>({
  get: () => store.currentBlock?.content ?? '',
  set: (v) => { if (store.currentBlock) { store.currentBlock.content = v; store.markDirty() } },
})

/** 切换激活 block 时关闭可能残留的 var-popup（避免指向旧 block 的变量上下文错误）。 */
watch(() => tabsStore.activeTab?.key, () => { store.hideVarPopup() }, { immediate: true })

function onVarClick(payload: { varName: string; cursorPos: number; pos: { top: number; left: number } }) {
  store.showVarPopup(payload.varName, store.currentBlock?.identifier ?? null, payload.cursorPos, payload.pos)
}

/** 字号/字体变化不改 textarea 尺寸，ResizeObserver 捕捉不到，主动 refresh。 */
watch(() => [uiStore.settings.editorFontSize, uiStore.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
