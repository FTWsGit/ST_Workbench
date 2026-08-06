<template>
  <div class="wb-editor-panel wb-regex-editor" v-if="entry">
    <div class="wb-editor-meta">
      <span class="wb-regex-editor-name">{{ entry.comment || uiStore.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: uiStore.settingsDockOpen }" @click="uiStore.toggleSettingsDock()" :title="uiStore.t('regex.editor.settingsPanel')">⚙</button>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :jump="tabsStore.editorJump"
      :placeholder="uiStore.t('worldbook.editor.placeholder')"
      enable-var-click
      :status-cursor-label="uiStore.t('shared.highlightedEditor.cursor')"
      :status-chars-label="uiStore.t('common.chars')"
      :status-lines-label="uiStore.t('common.lines')"
      @var-click="onVarClick"
      @var-click-miss="presetStore.hideVarPopup()" />
  </div>
</template>

<script setup lang="ts">
/** 世界书内容编辑器：条目内容为纯文本（无正则测试栏/HTML 预览）。不参数化，直接 useWorldbookStore()。 */
import { ref, computed, watch } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = useWorldbookStore()
const presetStore = usePresetStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

const entry = computed(() => store.currentEntry)

/** entry.content 的 v-model 桥接；entries 浅监听，nested 字段变化需显式 markDirty()。 */
const contentModel = computed<string>({
  get: () => entry.value?.content ?? '',
  set: (v) => { if (entry.value) { entry.value.content = v; store.markDirty() } },
})

/** 切换条目时关闭可能残留的 var-popup（避免指向旧 entry 的变量上下文错误）。 */
watch(() => tabsStore.activeTab?.key, () => { presetStore.hideVarPopup() }, { immediate: true })

/** var-click 路由到 presetStore 的跨域 useVarNav——showVarPopup/jumpToPopupVar 都挂在那（跨域扫描+跳转）。 */
function onVarClick(payload: { varName: string; scope: 'local' | 'global'; cursorPos: number; pos: { top: number; left: number } }) {
  presetStore.showVarPopup(payload.varName, payload.scope, 'worldbook', entry.value ? String(entry.value.uid) : null, payload.cursorPos, payload.pos)
}

watch(() => [uiStore.settings.editorFontSize, uiStore.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
