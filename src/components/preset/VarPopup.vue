<template>
  <div v-if="store.varPopupOpen" class="pr-var-popup" :style="{ top: store.varPopupPos.top + 'px', left: store.varPopupPos.left + 'px' }">
    <div class="pr-vp-header">
      <span class="pr-vp-varname">{{ store.varPopupVarName }}</span>
      <span class="pr-vp-count">{{ uiStore.t(store.varPopupOps.length !== 1 ? 'preset.varPopup.hit' : 'preset.varPopup.hitSingle', { count: store.varPopupOps.length }) }}</span>
      <span class="pr-vp-spacer"></span>
      <button class="pr-vp-btn" aria-label="上一个匹配" @click="store.navPopupVar(-1)">◀</button>
      <button class="pr-vp-btn" aria-label="下一个匹配" @click="store.navPopupVar(1)">▶</button>
      <button class="pr-vp-btn close-btn" :aria-label="uiStore.t('common.close')" @click="store.hideVarPopup()">✕</button>
    </div>
    <div class="pr-vp-list">
      <div v-for="(v, i) in store.varPopupOps" :key="i"
           class="pr-vp-item" :class="{ current: i === store.varPopupIdx }"
           @click="store.jumpToPopupVar(i)">
        <span class="pr-vr-type" :class="varOpBadge(v.type).cls">{{ varOpBadge(v.type).label }}</span>
        <span v-if="v.varValue" class="pr-vr-val">{{ v.varValue.length > 35 ? v.varValue.substring(0, 35) + '…' : v.varValue }}</span>
        <span class="pr-vr-block">[{{ v.blockName }}]</span>
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

/** 点击弹窗外或编辑器内另一个 {{var}} 时关闭弹窗：排除 .pr-var-popup 本身与 .wb-editor-ta（让点别的 var 重新定位弹窗正常工作）。ESC 也关闭。 */
function onDocClick(e: MouseEvent) {
  if (!store.varPopupOpen) return
  const target = e.target as HTMLElement
  if (target.closest('.pr-var-popup') || target.closest('.wb-editor-ta')) return
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
