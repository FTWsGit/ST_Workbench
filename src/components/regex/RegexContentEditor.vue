<template>
  <div class="wb-editor-panel wb-regex-editor" v-if="script">
    <div class="wb-editor-meta">
      <span class="wb-regex-editor-name">{{ script.scriptName || props.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">{{ props.t('regex.editor.edit') }}</button>
      <button class="wb-btn sm" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">{{ props.t('regex.editor.preview') }}</button>
      <template v-if="mode === 'preview'">
        <button class="wb-btn sm" :class="{ active: !renderHtml }" @click="renderHtml = false">{{ props.t('regex.editor.plainText') }}</button>
        <button class="wb-btn sm" :class="{ active: renderHtml }" @click="renderHtml = true">{{ props.t('regex.editor.html') }}</button>
      </template>
      <button class="wb-btn sm" :class="{ active: uiStore.settingsDockOpen }" @click="uiStore.toggleSettingsDock()" :title="props.t('regex.editor.settingsPanel')">⚙</button>
    </div>

    <HighlightedEditor v-if="mode === 'edit'"
      ref="editorRef"
      v-model="replaceStringModel"
      :placeholder="props.t('regex.editor.placeholder')"
      :status-cursor-label="props.t('shared.highlightedEditor.cursor')"
      :status-chars-label="props.t('common.chars')"
      :status-lines-label="props.t('common.lines')" />

    <div v-else class="wb-regex-editor-body">
      <div v-if="!renderHtml" class="wb-regex-editor-preview">{{ previewText }}</div>
      <div v-else class="wb-regex-editor-preview" v-html="previewText"></div>
    </div>

    <div class="wb-regex-editor-testbar">
      <label class="wb-form-label">{{ props.t('regex.editor.testText') }}</label>
      <textarea class="wb-regex-editor-testinput" rows="3" v-model="testInput" :placeholder="props.t('regex.editor.testPlaceholder')"></textarea>
      <p v-if="!findValid" class="wb-regex-err">{{ props.t('regex.editor.invalidFindRegex') }}</p>
      <p class="wb-muted" style="font-size:12px">{{ props.t('regex.editor.previewLimitation') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
import { applyRegexScript, parseFindRegex } from '../../regexEngine'
import HighlightedEditor from '../shared/HighlightedEditor.vue'
import type { RegexContentEditorProps } from './regexProps'

const props = defineProps<RegexContentEditorProps>()

const tabsStore = useTabsStore()
const uiStore = useUiStore()
const mode = ref<'edit' | 'preview'>('edit')
const renderHtml = ref(false)
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()
/** 测试文本：当前为全局共享 ref，切换标签不各自保留；如有需要再升级为 Record<id,string>。 */
const testInput = ref('')

const script = computed(() => props.scripts.find(r => r.id === tabsStore.activeTab?.key) ?? null)
const findValid = computed(() => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex))
const previewText = computed(() => {
  if (!script.value || !testInput.value) return ''
  try { return applyRegexScript(testInput.value, script.value) }
  catch (e: any) { return props.t('regex.editor.previewError', { msg: e?.message || e }) }
})

/** 当前选中脚本 replaceString 的 v-model 桥接；切换标签时 getter 返回值变化，编辑器会自动重渲染。 */
const replaceStringModel = computed<string>({
  get: () => script.value?.replaceString ?? '',
  set: (v) => { if (script.value) script.value.replaceString = v },
})

/** 字号/字体变化不会改变 textarea 尺寸，ResizeObserver 捕捉不到，需主动 refresh。 */
watch(() => [props.editorFontSize, props.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
