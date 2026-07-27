<template>
  <div class="wb-editor-panel rx-editor" v-if="field">
    <div class="wb-editor-meta">
      <span class="rx-editor-name">{{ fieldLabel }}</span>
    </div>
    <!-- depthPrompt（角色备注）比其它虚拟字段多两个数值/枚举字段（depth/role），角色卡故意不接
         SettingsDock（TODO.md 2.4），没有别的地方能编辑这两个字段，所以在这里单独加一条 meta 栏
         承载——见 types.ts Character 接口顶部 doc comment。 -->
    <div v-if="isDepthPrompt" class="wb-editor-meta">
      <label class="rx-label" style="margin:0">{{ uiStore.t('character.editor.depthLabel') }}</label>
      <input type="number" class="rx-input rx-num" v-model.number="depthPromptDepth" />
      <label class="rx-label" style="margin:0">{{ uiStore.t('character.editor.roleLabel') }}</label>
      <select class="wb-select-wide" v-model.number="depthPromptRole">
        <option v-for="opt in CHARACTER_DEPTH_ROLE_OPTIONS" :key="opt.value" :value="opt.value">{{ uiStore.t(opt.labelKey) }}</option>
      </select>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :placeholder="uiStore.t('character.editor.placeholder')"
      :status-cursor-label="uiStore.t('shared.highlightedEditor.cursor')"
      :status-chars-label="uiStore.t('common.chars')"
      :status-lines-label="uiStore.t('common.lines')" />
  </div>
</template>

<script setup lang="ts">
/* 角色卡虚拟字段内容编辑区（TODO.md 2.3）：activeTab.key 是 `field:xxx` / `field:greeting:<id>`
 * 这种虚拟字段 key，不像 preset/worldbook 那样直接对应数组里的一条真实记录——解析逻辑全部收在
 * characterStore.currentField/setCurrentFieldValue 里，这里只管 v-model 桥接，不自己解析 key。 */
import { ref, computed, watch } from 'vue'
import { useCharacterStore } from '../../stores/characterStore'
import { useUiStore } from '../../stores/uiStore'
import { CHARACTER_FIELDS, CHARACTER_DEPTH_ROLE_OPTIONS } from '../../types'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = useCharacterStore()
const uiStore = useUiStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

const field = computed(() => store.currentField)

const isDepthPrompt = computed(() => field.value?.key === 'field:depthPrompt')

const fieldLabel = computed(() => {
  const key = field.value?.key
  if (!key) return ''
  if (key.startsWith('field:greeting:')) {
    const idx = store.greetingIds.indexOf(key.slice('field:greeting:'.length))
    return uiStore.t('character.sidebar.greetingLabel', { n: idx + 1 })
  }
  const found = CHARACTER_FIELDS.find(f => 'field:' + f.key === key)
  return found ? uiStore.t(found.labelKey) : key
})

const contentModel = computed<string>({
  get: () => field.value?.value ?? '',
  set: (v) => store.setCurrentFieldValue(v),
})

const depthPromptDepth = computed<number>({
  get: () => store.character?.depthPrompt.depth ?? 4,
  set: (v) => { if (store.character) { store.character.depthPrompt.depth = v; store.markDirty() } },
})
const depthPromptRole = computed<0 | 1 | 2>({
  get: () => store.character?.depthPrompt.role ?? 0,
  set: (v) => { if (store.character) { store.character.depthPrompt.role = v; store.markDirty() } },
})

watch(() => [uiStore.settings.editorFontSize, uiStore.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
