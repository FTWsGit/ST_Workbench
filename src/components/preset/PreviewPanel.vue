<template>
  <!-- 完全悬浮态：FloatingPanelShell 接管（桌面可拖拽/缩放，移动端自动变 bottom sheet）。 -->
  <FloatingPanelShell
    v-if="mode === 'float'"
    :title="uiStore.t('preset.preview.title')"
    :close-title="uiStore.t('common.close')"
    :width="uiStore.settings.previewWidth"
    :min-width="350"
    @close="tabsStore.setPreviewOpen(tabsStore.activeWorkspace, false)"
  >
    <template #title>
      <span class="wb-preset-preview-float-title">
        <span class="wb-preset-preview-float-name">{{ uiStore.t('preset.preview.title') }}</span>
        <button v-if="store.previewMode === 'blocks'" class="wb-btn icon-btn" :title="uiStore.t('preset.preview.collapseExpand')" :aria-label="uiStore.t('preset.preview.collapseExpand')" @click="store.toggleAllPreviewBlocks()">▾</button>
        <PanelModeSwitch :model-value="mode" @update:model-value="setMode" />
      </span>
    </template>
    <div class="wb-preset-preview-body">
      <div class="wb-preset-pp-tools">
        <div class="wb-preset-preview-tabs">
          <button class="wb-preset-preview-tab" :class="{ active: store.previewMode === 'blocks' }" @click="store.previewMode = 'blocks'">{{ uiStore.t('preset.preview.modeBlocks') }}</button>
          <button class="wb-preset-preview-tab" :class="{ active: store.previewMode === 'raw' }" @click="store.previewMode = 'raw'">{{ uiStore.t('preset.preview.modeRaw') }}</button>
        </div>
        <p class="wb-preset-pp-mode-hint">
          <template v-if="store.previewMode === 'blocks'">{{ uiStore.t('preset.preview.hintBlocks') }}</template>
          <template v-else>{{ uiStore.t('preset.preview.hintRaw') }}</template>
        </p>
        <div class="wb-row-mt">
          <button class="wb-btn accent" :disabled="store.previewLoading" @click="generate()">
            <template v-if="store.previewLoading">{{ uiStore.t('preset.preview.generating') }}</template>
            <template v-else>{{ uiStore.t('preset.preview.generate') }}</template>
          </button>
          <button class="wb-btn" @click="copyPreview()">{{ uiStore.t('preset.preview.copy') }}</button>
        </div>
        <p v-if="store.previewError" class="wb-preset-pp-error">⚠ {{ store.previewError }}</p>
      </div>
      <div class="wb-preset-pp-output-wrap">
        <template v-if="store.previewMode === 'blocks'">
          <template v-if="store.previewBlockGroups.length">
            <div v-for="g in store.previewBlockGroups" :key="g.id" class="wb-preset-pb-block" :class="{ collapsed: store.previewCollapsed[g.id] }">
              <div class="wb-preset-pb-header" @click="store.togglePreviewBlock(g.id)">
                <span v-if="g.isMarker" class="wb-preset-pb-role pb-marker">MARKER</span>
                <span class="wb-preset-pb-name">{{ g.name }}</span>
                <span class="wb-preset-pb-msg-count" v-if="g.messages.length > 1">{{ g.messages.length }} {{ uiStore.t('common.messages') }}</span>
                <button class="wb-preset-pb-toggle" :title="uiStore.t('preset.preview.collapseExpandSingle')">▾</button>
              </div>
              <div class="wb-preset-pb-body">
                <div v-for="(m, mi) in g.messages" :key="mi" class="wb-preset-pb-msg">
                  <div class="wb-preset-pb-msg-meta">
                    <span class="wb-preset-pb-role" :class="roleClass(m.role)">{{ m.role.toUpperCase() }}</span>
                    <span class="wb-preset-pb-tokens">{{ m.tokens }} {{ uiStore.t('common.tokens') }}</span>
                  </div>
                  <pre class="wb-preset-pb-msg-text" v-html="renderSegments(m.segments)"></pre>
                </div>
              </div>
            </div>
          </template>
          <p v-else-if="!store.previewLoading" class="wb-muted">{{ uiStore.t('preset.preview.emptyBlocks') }}</p>
        </template>
        <template v-else>
          <pre v-if="store.previewRawText" class="wb-preset-pp-raw">{{ store.previewRawText }}</pre>
          <p v-else-if="!store.previewLoading" class="wb-muted">{{ uiStore.t('preset.preview.emptyRaw') }}</p>
        </template>
      </div>
    </div>
  </FloatingPanelShell>

  <!-- 嵌入/悬浮态：docked 在文档流里挤开编辑区；overlay absolute 盖在右侧不挤开。 -->
  <div v-else class="wb-preset-preview-panel" :class="{ float: mode === 'overlay' }" :style="{ width: uiStore.settings.previewWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('preset.preview.title') }}</span>
      <div class="wb-row-tight">
        <button v-if="store.previewMode === 'blocks'" class="wb-btn icon-btn" :title="uiStore.t('preset.preview.collapseExpand')" :aria-label="uiStore.t('preset.preview.collapseExpand')" @click="store.toggleAllPreviewBlocks()">▾</button>
        <PanelModeSwitch :model-value="mode" @update:model-value="setMode" />
        <button class="wb-btn close-btn compact" :aria-label="uiStore.t('common.close')" @click="tabsStore.setPreviewOpen(tabsStore.activeWorkspace, false)">✕</button>
      </div>
    </div>
    <div class="wb-preset-preview-body">
      <div class="wb-preset-pp-tools">
        <div class="wb-preset-preview-tabs">
          <button class="wb-preset-preview-tab" :class="{ active: store.previewMode === 'blocks' }" @click="store.previewMode = 'blocks'">{{ uiStore.t('preset.preview.modeBlocks') }}</button>
          <button class="wb-preset-preview-tab" :class="{ active: store.previewMode === 'raw' }" @click="store.previewMode = 'raw'">{{ uiStore.t('preset.preview.modeRaw') }}</button>
        </div>
        <p class="wb-preset-pp-mode-hint">
          <template v-if="store.previewMode === 'blocks'">{{ uiStore.t('preset.preview.hintBlocks') }}</template>
          <template v-else>{{ uiStore.t('preset.preview.hintRaw') }}</template>
        </p>
        <div class="wb-row-mt">
          <button class="wb-btn accent" :disabled="store.previewLoading" @click="generate()">
            <template v-if="store.previewLoading">{{ uiStore.t('preset.preview.generating') }}</template>
            <template v-else>{{ uiStore.t('preset.preview.generate') }}</template>
          </button>
          <button class="wb-btn" @click="copyPreview()">{{ uiStore.t('preset.preview.copy') }}</button>
        </div>
        <p v-if="store.previewError" class="wb-preset-pp-error">⚠ {{ store.previewError }}</p>
      </div>
      <div class="wb-preset-pp-output-wrap">
        <template v-if="store.previewMode === 'blocks'">
          <template v-if="store.previewBlockGroups.length">
            <div v-for="g in store.previewBlockGroups" :key="g.id" class="wb-preset-pb-block" :class="{ collapsed: store.previewCollapsed[g.id] }">
              <div class="wb-preset-pb-header" @click="store.togglePreviewBlock(g.id)">
                <span v-if="g.isMarker" class="wb-preset-pb-role pb-marker">MARKER</span>
                <span class="wb-preset-pb-name">{{ g.name }}</span>
                <span class="wb-preset-pb-msg-count" v-if="g.messages.length > 1">{{ g.messages.length }} {{ uiStore.t('common.messages') }}</span>
                <button class="wb-preset-pb-toggle" :title="uiStore.t('preset.preview.collapseExpandSingle')">▾</button>
              </div>
              <div class="wb-preset-pb-body">
                <div v-for="(m, mi) in g.messages" :key="mi" class="wb-preset-pb-msg">
                  <div class="wb-preset-pb-msg-meta">
                    <span class="wb-preset-pb-role" :class="roleClass(m.role)">{{ m.role.toUpperCase() }}</span>
                    <span class="wb-preset-pb-tokens">{{ m.tokens }} {{ uiStore.t('common.tokens') }}</span>
                  </div>
                  <pre class="wb-preset-pb-msg-text" v-html="renderSegments(m.segments)"></pre>
                </div>
              </div>
            </div>
          </template>
          <p v-else-if="!store.previewLoading" class="wb-muted">{{ uiStore.t('preset.preview.emptyBlocks') }}</p>
        </template>
        <template v-else>
          <pre v-if="store.previewRawText" class="wb-preset-pp-raw">{{ store.previewRawText }}</pre>
          <p v-else-if="!store.previewLoading" class="wb-muted">{{ uiStore.t('preset.preview.emptyRaw') }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { esc, roleClass as roleClassOf } from '../../utils'
import { usePanelResize } from '../../composables/usePanelResize'
import { copyToHostClipboard } from '../../composables/hostEnv'
import { watch, computed } from 'vue'
import type { PreviewSegment, PanelMode } from '../../types'
import FloatingPanelShell from '../shared/FloatingPanelShell.vue'
import PanelModeSwitch from '../shared/PanelModeSwitch.vue'

const store = usePresetStore()
const uiStore = useUiStore()
/** previewOpen 按 workspace 分桶存于 tabsStore；目前仅对 'preset' 工作区渲染，关闭时硬编码 'preset'。若未来 character 工作区也接入 Preview，需改为读 activeWorkspace。 */
const tabsStore = useTabsStore()

/** 当前形态（docked 挤开 / overlay 右侧悬浮 / float 完全悬浮），持久化到 settings.previewMode。 */
const mode = computed<PanelMode>(() => uiStore.settings.previewMode)
function setMode(m: PanelMode) {
  uiStore.settings.previewMode = m
  uiStore.saveSettings()
}

const resize = usePanelResize({
  getWidth: () => uiStore.settings.previewWidth,
  setWidth: (w) => { uiStore.settings.previewWidth = w },
  min: 350, max: 1100, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

function roleClass(role: string) {
  return roleClassOf(role, 'pb-')
}

function renderSegments(segments: PreviewSegment[]) {
  return segments.map(s => s.added ? `<span class="wb-preset-phl">${esc(s.text)}</span>` : esc(s.text)).join('')
}

function generate() {
  store.selectPresetByName(store.presetName)
  if (store.previewMode === 'blocks') store.generatePreviewBlocks()
  else store.generatePreviewRaw()
}

async function copyPreview() {
  const text = store.previewMode === 'blocks'
    ? store.previewBlockGroups.flatMap(g => g.messages.map(m => m.segments.map(s => s.text).join(''))).join('\n\n')
    : store.previewRawText
  if (!text.trim()) { uiStore.showToast(uiStore.t('preset.toast.nothingToCopy')); return }
  const ok = await copyToHostClipboard(text)
  uiStore.showToast(ok ? uiStore.t('preset.toast.copied') : uiStore.t('preset.toast.copyFailed'))
}
</script>
