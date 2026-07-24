<template>
  <div class="pr-preview-panel" :class="{ float: store.settings.previewFloat }" :style="{ width: store.settings.previewWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ store.t('preset.preview.title') }}</span>
      <div class="wb-row-tight">
        <button v-if="store.previewMode === 'blocks'" class="wb-btn icon-btn" :title="store.t('preset.preview.collapseExpand')" @click="store.toggleAllPreviewBlocks()">▾</button>
        <button class="wb-btn icon-btn" :class="{ active: store.settings.previewFloat }" :title="store.t('preset.preview.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" @click="store.previewOpen = false">✕</button>
      </div>
    </div>
    <div class="pr-pp-tools">
      <div class="pr-preview-tabs">
        <button class="pr-preview-tab" :class="{ active: store.previewMode === 'blocks' }" @click="store.previewMode = 'blocks'">{{ store.t('preset.preview.modeBlocks') }}</button>
        <button class="pr-preview-tab" :class="{ active: store.previewMode === 'raw' }" @click="store.previewMode = 'raw'">{{ store.t('preset.preview.modeRaw') }}</button>
      </div>
      <p class="pr-pp-mode-hint">
        <template v-if="store.previewMode === 'blocks'">{{ store.t('preset.preview.hintBlocks') }}</template>
        <template v-else>{{ store.t('preset.preview.hintRaw') }}</template>
      </p>
      <div class="wb-row-mt">
        <button class="wb-btn accent" :disabled="store.previewLoading" @click="generate()">
          <template v-if="store.previewLoading">{{ store.t('preset.preview.generating') }}</template>
          <template v-else>{{ store.t('preset.preview.generate') }}</template>
        </button>
        <button class="wb-btn" @click="copyPreview()">{{ store.t('preset.preview.copy') }}</button>
      </div>
      <p v-if="store.previewError" class="pr-pp-error">⚠ {{ store.previewError }}</p>
    </div>
    <div class="pr-pp-output-wrap">
      <template v-if="store.previewMode === 'blocks'">
        <template v-if="store.previewBlockGroups.length">
          <div v-for="g in store.previewBlockGroups" :key="g.id" class="pr-pb-block" :class="{ collapsed: store.previewCollapsed[g.id] }">
            <div class="pr-pb-header" @click="store.togglePreviewBlock(g.id)">
              <span v-if="g.isMarker" class="pr-pb-role pb-marker">MARKER</span>
              <span class="pr-pb-name">{{ g.name }}</span>
              <span class="pr-pb-msg-count" v-if="g.messages.length > 1">{{ g.messages.length }} {{ store.t('common.messages') }}</span>
              <button class="pr-pb-toggle" :title="store.t('preset.preview.collapseExpandSingle')">▾</button>
            </div>
            <div class="pr-pb-body">
              <div v-for="(m, mi) in g.messages" :key="mi" class="pr-pb-msg">
                <div class="pr-pb-msg-meta">
                  <span class="pr-pb-role" :class="roleClass(m.role)">{{ m.role.toUpperCase() }}</span>
                  <span class="pr-pb-tokens">{{ m.tokens }} {{ store.t('common.tokens') }}</span>
                </div>
                <pre class="pr-pb-msg-text" v-html="renderSegments(m.segments)"></pre>
              </div>
            </div>
          </div>
        </template>
        <p v-else-if="!store.previewLoading" class="wb-muted">{{ store.t('preset.preview.emptyBlocks') }}</p>
      </template>
      <template v-else>
        <pre v-if="store.previewRawText" class="pr-pp-raw">{{ store.previewRawText }}</pre>
        <p v-else-if="!store.previewLoading" class="wb-muted">{{ store.t('preset.preview.emptyRaw') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { esc, roleClass as roleClassOf } from '../../utils'
import { usePanelResize } from '../../composables/usePanelResize'
import { copyToHostClipboard } from '../../composables/hostEnv'
import { watch } from 'vue'
import type { PreviewSegment } from '../../types'

const store = usePresetStore()

const resize = usePanelResize({
  getWidth: () => store.settings.previewWidth,
  setWidth: (w) => { store.settings.previewWidth = w },
  min: 350, max: 1100, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

function toggleFloat() {
  store.settings.previewFloat = !store.settings.previewFloat
  store.saveSettings()
}

function roleClass(role: string) {
  return roleClassOf(role, 'pb-')
}

function renderSegments(segments: PreviewSegment[]) {
  return segments.map(s => s.added ? `<span class="pr-phl">${esc(s.text)}</span>` : esc(s.text)).join('')
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
  if (!text.trim()) { store.showToast(store.t('shared.toast.nothingToCopy')); return }
  const ok = await copyToHostClipboard(text)
  store.showToast(ok ? store.t('shared.toast.copied') : store.t('shared.toast.copyFailed'))
}
</script>
