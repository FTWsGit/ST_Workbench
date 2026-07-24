<template>
  <div class="wb-editor-panel rx-editor" v-if="script">
    <div class="wb-editor-meta">
      <span class="rx-editor-name">{{ script.scriptName || store.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button class="wb-btn sm" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">{{ store.t('regex.editor.edit') }}</button>
      <button class="wb-btn sm" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">{{ store.t('regex.editor.preview') }}</button>
      <template v-if="mode === 'preview'">
        <button class="wb-btn sm" :class="{ active: !renderHtml }" @click="renderHtml = false">{{ store.t('regex.editor.plainText') }}</button>
        <button class="wb-btn sm" :class="{ active: renderHtml }" @click="renderHtml = true">{{ store.t('regex.editor.html') }}</button>
      </template>
      <button class="wb-btn sm" :class="{ active: tabsStore.settingsDockOpen }" @click="tabsStore.toggleSettingsDock()" :title="store.t('regex.editor.settingsPanel')">⚙</button>
    </div>

    <HighlightedEditor v-if="mode === 'edit'"
      ref="editorRef"
      v-model="replaceStringModel"
      :placeholder="store.t('regex.editor.placeholder')"
      :status-cursor-label="store.t('shared.highlightedEditor.cursor')"
      :status-chars-label="store.t('common.chars')"
      :status-lines-label="store.t('common.lines')" />

    <div v-else class="rx-editor-body">
      <div v-if="!renderHtml" class="rx-editor-preview">{{ previewText }}</div>
      <div v-else class="rx-editor-preview" v-html="previewText"></div>
    </div>

    <div class="rx-editor-testbar">
      <label class="rx-label" style="margin:0">{{ store.t('regex.editor.testText') }}</label>
      <textarea class="rx-editor-testinput" rows="3" v-model="testInput" :placeholder="store.t('regex.editor.testPlaceholder')"></textarea>
      <p v-if="!findValid" class="rx-err">{{ store.t('regex.editor.invalidFindRegex') }}</p>
      <p class="wb-muted" style="font-size:12px">{{ store.t('regex.editor.previewLimitation') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useTabsStore } from '../../stores/tabsStore'
import { applyRegexScript, parseFindRegex } from '../../regexEngine'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = usePresetStore()
const tabsStore = useTabsStore()
const mode = ref<'edit' | 'preview'>('edit')
const renderHtml = ref(false)
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()
// 简化处理：测试文本这一版是单个共享 ref，切换正则标签不会各自记住各自的测试文本——
// 用起来发现真的需要"每条正则记自己的测试文本"再升级成 Record<id, string>，先别过度设计。
const testInput = ref('')

const script = computed(() => store.regexScripts.find(r => r.id === tabsStore.activeTab?.key) ?? null)
const findValid = computed(() => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex))
const previewText = computed(() => {
  if (!script.value || !testInput.value) return ''
  try { return applyRegexScript(testInput.value, script.value) }
  catch (e: any) { return store.t('regex.editor.previewError', { msg: e?.message || e }) }
})

// v-model bridge into the currently-selected script's replaceString — same pattern as
// PresetContentEditor.vue's `content` computed. When the active regex tab changes, this getter's
// return value changes too, and HighlightedEditor's own "external modelValue change" detection
// picks it up and re-renders — no extra watcher needed here for that.
const replaceStringModel = computed<string>({
  get: () => script.value?.replaceString ?? '',
  set: (v) => { if (script.value) script.value.replaceString = v },
})

// Settings dialog font-size/family changes don't resize the textarea itself, so
// HighlightedEditor's own ResizeObserver won't catch them — nudge it explicitly, same as
// PresetContentEditor.vue.
watch(() => [store.settings.editorFontSize, store.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
