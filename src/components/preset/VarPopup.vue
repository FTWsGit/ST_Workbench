<template>
  <div v-if="store.varPopupOpen" class="pr-var-popup" :style="{ top: store.varPopupPos.top + 'px', left: store.varPopupPos.left + 'px' }">
    <div class="pr-vp-header">
      <span class="pr-vp-varname">{{ store.varPopupVarName }}</span>
      <span class="pr-vp-count">{{ store.t(store.varPopupOps.length !== 1 ? 'preset.varPopup.hit' : 'preset.varPopup.hitSingle', { count: store.varPopupOps.length }) }}</span>
      <span class="pr-vp-spacer"></span>
      <button class="pr-vp-btn" @click="store.navPopupVar(-1)">◀</button>
      <button class="pr-vp-btn" @click="store.navPopupVar(1)">▶</button>
      <button class="pr-vp-btn close-btn" @click="store.hideVarPopup()">✕</button>
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
import { getHostDocument } from '../../composables/hostEnv'
import { varOpBadge } from '../../utils'

const store = usePresetStore()

// Close on outside click (anywhere that isn't the popup itself or the editor textarea, so
// clicking a different {{var}} to re-target the popup still works via checkVarClick).
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
