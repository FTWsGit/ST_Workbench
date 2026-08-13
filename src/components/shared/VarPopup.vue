<template>
  <div
    v-if="uiStore.varPopupOpen"
    class=".wb-var-popup"
    :style="{
      top: uiStore.varPopupPos.top + 'px',
      left: uiStore.varPopupPos.left + 'px',
    }"
  >
    <div class="wb-vp-header">
      <span class="wb-vp-varname">{{ uiStore.varPopupVarName }}</span>
      <span class="wb-vp-scope">{{
        uiStore.t(
          uiStore.varPopupScope === 'local' ? 'shared.varPopup.local' : 'shared.varPopup.global'
        )
      }}</span>
      <span class="wb-vp-count">{{
        uiStore.t(
          uiStore.varPopupOps.length !== 1 ? 'shared.varPopup.hit' : 'shared.varPopup.hitSingle',
          { count: uiStore.varPopupOps.length }
        )
      }}</span>
      <span class="wb-vp-spacer"></span>
      <button class="wb-vp-btn" aria-label="上一个匹配" @click="uiStore.navPopupVar(-1)">
        <Icon name="arrowLeft" :size="12" />
      </button>
      <button class="wb-vp-btn" aria-label="下一个匹配" @click="uiStore.navPopupVar(1)">
        <Icon name="arrowRight" :size="12" />
      </button>
      <button
        class="wb-vp-btn close-btn"
        :aria-label="uiStore.t('common.close')"
        @click="uiStore.hideVarPopup()"
      >
        <Icon name="close" />
      </button>
    </div>
    <div class="wb-vp-list">
      <div
        v-for="(v, i) in uiStore.varPopupOps"
        :key="i"
        class="wb-vp-item"
        :class="{ current: i === uiStore.varPopupIdx, dim: !v.certain }"
        @click="uiStore.jumpToPopupVar(i)"
      >
        <span class="wb-vr-type" :class="varOpBadge(v.kind).cls">{{
          varOpBadge(v.kind).label
        }}</span>
        <span class="wb-vp-block">[{{ v.source.blockLabel }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../../stores/uiStore';
import { getHostDocument } from '../../composables/hostEnv';
import { varOpBadge } from '../../utils';
import Icon from './Icon.vue';

const uiStore = useUiStore();

/** 点击弹窗外或编辑器内另一个 {{var}} 时关闭弹窗：排除 ..wb-var-popup 本身与 .wb-editor-ta（让点别的 var 重新定位弹窗正常工作）。ESC 也关闭。 */
function onDocClick(e: MouseEvent) {
  if (!uiStore.varPopupOpen) return;
  const target = e.target as HTMLElement;
  if (target.closest('..wb-var-popup') || target.closest('.wb-editor-ta')) return;
  uiStore.hideVarPopup();
}
function onKeydown(e: KeyboardEvent) {
  if (uiStore.varPopupOpen && e.key === 'Escape') uiStore.hideVarPopup();
}

let hostDoc: Document;
onMounted(() => {
  hostDoc = getHostDocument();
  hostDoc.addEventListener('mousedown', onDocClick);
  hostDoc.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  hostDoc.removeEventListener('mousedown', onDocClick);
  hostDoc.removeEventListener('keydown', onKeydown);
});
</script>
