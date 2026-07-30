<template>
  <!-- 设置 -->
  <div v-if="uiStore.settingsOpen" class="wb-modal-overlay" @click.self="uiStore.settingsOpen = false">
    <div class="wb-modal lg">
      <h3>⚙ {{ uiStore.t('shared.settings.title') }}</h3>
      <div class="wb-modal-scroll">
        <div class="wb-settings-section">
          <label>{{ uiStore.t('shared.settings.language') }}</label>
          <select class="wb-select-wide" :value="uiStore.settings.language"
                  @change="uiStore.settings.language = ($event.target as HTMLSelectElement).value as 'zh-CN' | 'en'; uiStore.saveSettings()">
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div class="wb-settings-section">
          <label>{{ uiStore.t('shared.settings.fontSize') }}</label>
          <div class="wb-row">
            <input type="range" min="11" max="22" step="0.5" class="wb-range-wide"
                   v-model.number="draftFontSize"
                   @change="commitFontSize" />
            <span class="wb-value-label">{{ draftFontSize }}px</span>
          </div>
        </div>
        <div class="wb-settings-section">
          <label>{{ uiStore.t('shared.settings.fontFamily') }}</label>
          <select class="wb-select-wide" :value="uiStore.settings.editorFontFamily"
                  @change="uiStore.settings.editorFontFamily = ($event.target as HTMLSelectElement).value; uiStore.saveSettings()">
            <option v-for="f in FONT_OPTIONS" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
        </div>
        <div class="wb-settings-section">
          <label>{{ uiStore.t('shared.settings.syntaxColors') }}</label>
          <div v-for="(labelKey, key) in SYNTAX_LABEL_KEYS" :key="key" class="wb-color-row">
            <input type="color" v-model="draftColors[key as keyof SyntaxColors]" @change="commitColor(key as keyof SyntaxColors)" />
            <span class="cl-label">{{ uiStore.t(labelKey) }}</span>
            <span class="cl-hex">{{ draftColors[key as keyof SyntaxColors] }}</span>
          </div>
        </div>
      </div>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="uiStore.resetSettings()">{{ uiStore.t('shared.settings.resetDefaults') }}</button>
        <button class="wb-btn accent" @click="uiStore.settingsOpen = false">{{ uiStore.t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- 通用确认框（confirmStore）：应用内所有"你确定吗"走这里，禁用原生 confirm()（Tauri WebView2 下不可靠）。 -->
  <div v-if="confirmStore.open" class="wb-modal-overlay" @click.self="confirmStore.cancel()">
    <div class="wb-modal sm">
      <h3>{{ confirmStore.title }}</h3>
      <p class="wb-confirm-text" v-html="confirmStore.message"></p>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="confirmStore.cancel()">{{ confirmStore.cancelText }}</button>
        <button class="wb-btn accent" :class="{ 'wb-confirm-danger': confirmStore.danger }" @click="confirmStore.confirm()">{{ confirmStore.confirmText }}</button>
      </div>
    </div>
  </div>

  <!-- 通用输入框（confirmStore）：替代 window.prompt()，同 WebView2 原因。 -->
  <div v-if="confirmStore.promptOpen" class="wb-modal-overlay" @click.self="confirmStore.cancelPrompt()">
    <div class="wb-modal sm">
      <h3>{{ confirmStore.promptTitle }}</h3>
      <p v-if="confirmStore.promptMessage" class="wb-confirm-text">{{ confirmStore.promptMessage }}</p>
      <input type="text" class="wb-prompt-input" ref="promptInputRef"
             v-model="confirmStore.promptValue"
             :placeholder="confirmStore.promptPlaceholder"
             @keydown.enter.prevent="confirmStore.confirmPrompt()"
             @keydown.esc.prevent="confirmStore.cancelPrompt()" />
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="confirmStore.cancelPrompt()">{{ confirmStore.promptCancelText }}</button>
        <button class="wb-btn accent" @click="confirmStore.confirmPrompt()">{{ confirmStore.promptConfirmText }}</button>
      </div>
    </div>
  </div>

  <!-- 通用多对象确认框（confirmStore）：用于"跨工作区未保存改动关闭面板"等多文档确认场景，列表只读展示。 -->
  <div v-if="confirmStore.multiOpen" class="wb-modal-overlay" @click.self="confirmStore.cancelMulti()">
    <div class="wb-modal sm">
      <h3>{{ confirmStore.multiTitle }}</h3>
      <p v-if="confirmStore.multiMessage" class="wb-confirm-text" v-html="confirmStore.multiMessage"></p>
      <div class="wb-modal-list">
        <div v-for="(it, i) in confirmStore.multiItems" :key="i" class="wb-modal-item static">
          <span class="wb-flex1">{{ it.label }}</span>
        </div>
      </div>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="confirmStore.cancelMulti()">{{ confirmStore.multiCancelText }}</button>
        <button class="wb-btn accent" :class="{ 'wb-confirm-danger': confirmStore.multiDanger }" @click="confirmStore.confirmMulti()">{{ confirmStore.multiConfirmText }}</button>
      </div>
    </div>
  </div>

  <!-- 添加隐藏块 -->
  <div v-if="presetStore.hiddenOpen" class="wb-modal-overlay" @click.self="presetStore.hiddenOpen = false">
    <div class="wb-modal">
      <h3>{{ uiStore.t('preset.sidebar.hiddenBlock') }}</h3>
      <div class="wb-modal-list">
        <div v-if="!presetStore.hiddenBlocks.length" class="wb-empty-note">{{ uiStore.t('preset.copyPanel.noBlocks') }}</div>
        <div v-for="p in presetStore.hiddenBlocks" :key="p.identifier" class="wb-modal-item"
             @click="presetStore.addHiddenBlock(p.identifier); presetStore.hiddenOpen = false">
          <span class="pr-block-role" :class="roleClass(p.role)">{{ p.role }}</span>
          <span class="wb-flex1">{{ p.name || p.identifier }}</span>
        </div>
      </div>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="presetStore.hiddenOpen = false">{{ uiStore.t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="wb-toast" :class="{ show: uiStore.toastVisible }">{{ uiStore.toastMsg }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { FONT_OPTIONS, SYNTAX_LABEL_KEYS } from '../../types'
import type { SyntaxColors } from '../../types'
import { roleClass } from '../../utils'
import { useConfirmStore } from '../../stores/confirmStore'

const confirmStore = useConfirmStore()
const presetStore = usePresetStore()
const uiStore = useUiStore()

/** 字号滑块/颜色选择器的本地草稿：拖拽过程中只更新本地状态，避免每 tick 触发 cssVars 重算 + localStorage 写入；release 时才 commit。 */
const draftFontSize = ref(uiStore.settings.editorFontSize)
const draftColors = reactive<SyntaxColors>({ ...uiStore.settings.syntaxColors })

watch(() => uiStore.settingsOpen, (open) => {
  if (open) {
    // 每次打开重新同步，防止外部（如重置默认值）改动
    draftFontSize.value = uiStore.settings.editorFontSize
    Object.assign(draftColors, uiStore.settings.syntaxColors)
  }
})
watch(() => uiStore.settings.editorFontSize, (v) => { draftFontSize.value = v })
watch(() => uiStore.settings.syntaxColors, (v) => { Object.assign(draftColors, v) }, { deep: true })

function commitFontSize() {
  uiStore.settings.editorFontSize = draftFontSize.value
  uiStore.saveSettings()
}
function commitColor(key: keyof SyntaxColors) {
  uiStore.settings.syntaxColors[key] = draftColors[key]
  uiStore.saveSettings()
}

/** Prompt 弹窗打开时自动聚焦并全选，对齐 window.prompt() 行为。 */
const promptInputRef = ref<HTMLInputElement>()
watch(() => confirmStore.promptOpen, (open) => {
  if (open) nextTick(() => { promptInputRef.value?.focus(); promptInputRef.value?.select() })
})
</script>
