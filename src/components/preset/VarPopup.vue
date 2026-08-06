<template>
  <div v-if="store.varPopupOpen" class="wb-preset-var-popup" :style="{ top: store.varPopupPos.top + 'px', left: store.varPopupPos.left + 'px' }">
    <div class="wb-preset-vp-header">
      <span class="wb-preset-vp-varname">{{ store.varPopupVarName }}</span>
      <span class="wb-preset-vp-scope">{{ uiStore.t(store.varPopupScope === 'local' ? 'preset.varPopup.local' : 'preset.varPopup.global') }}</span>
      <span class="wb-preset-vp-count">{{ uiStore.t(store.varPopupOps.length !== 1 ? 'preset.varPopup.hit' : 'preset.varPopup.hitSingle', { count: store.varPopupOps.length }) }}</span>
      <span class="wb-preset-vp-spacer"></span>
      <button class="wb-preset-vp-btn" aria-label="上一个匹配" @click="store.navPopupVar(-1)">◀</button>
      <button class="wb-preset-vp-btn" aria-label="下一个匹配" @click="store.navPopupVar(1)">▶</button>
      <button class="wb-preset-vp-btn close-btn" :aria-label="uiStore.t('common.close')" @click="store.hideVarPopup()">✕</button>
    </div>
    <div class="wb-preset-vp-list">
      <div v-for="(v, i) in store.varPopupOps" :key="i"
           class="wb-preset-vp-item" :class="{ current: i === store.varPopupIdx, dim: !v.certain }"
           @click="store.jumpToPopupVar(i)">
        <span class="wb-preset-vr-type" :class="varOpBadge(v.kind).cls">{{ varOpBadge(v.kind).label }}</span>
        <span class="wb-preset-vp-block">[{{ v.source.blockLabel }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { getHostDocument } from '../../composables/hostEnv'
import { varOpBadge } from '../../utils'

const store = usePresetStore()
const uiStore = useUiStore()

/** 点击弹窗外或编辑器内另一个 {{var}} 时关闭弹窗：排除 .wb-preset-var-popup 本身与 .wb-editor-ta（让点别的 var 重新定位弹窗正常工作）。ESC 也关闭。 */
function onDocClick(e: MouseEvent) {
  if (!store.varPopupOpen) return
  const target = e.target as HTMLElement
  if (target.closest('.wb-preset-var-popup') || target.closest('.wb-editor-ta')) return
  store.hideVarPopup()
}
function onKeydown(e: KeyboardEvent) {
  if (store.varPopupOpen && e.key === 'Escape') store.hideVarPopup()
}

let hostDoc: Document
onMounted(() => {
  hostDoc = getHostDocument()
  hostDoc.addEventListener('mousedown', onDocClick)
  hostDoc.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  hostDoc.removeEventListener('mousedown', onDocClick)
  hostDoc.removeEventListener('keydown', onKeydown)
})
</script>
