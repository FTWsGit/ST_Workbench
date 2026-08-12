<template>
  <div
    class="wb-right-panel"
    :class="{ float: uiStore.settings.varPanelFloat }"
    :style="{ width: uiStore.settings.varPanelWidth + 'px' }"
  >
    <div
      class="wb-right-resize-handle"
      :class="{ active: resize.active.value }"
      @pointerdown="resize.onPointerDown"
    ></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('preset.varPanel.title') }}</span>
      <div class="wb-row-tight">
        <button
          class="wb-btn icon-btn"
          :class="{ active: uiStore.settings.varPanelFloat }"
          :title="uiStore.t('shared.floatingPanel.toggleFloat')"
          :aria-label="uiStore.t('shared.floatingPanel.toggleFloat')"
          @click="toggleFloat"
        >
          📌
        </button>
        <button
          class="wb-btn close-btn compact"
          :aria-label="uiStore.t('common.close')"
          @click="uiStore.varNavOpen = false"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="wb-rp-tools">
      <input
        type="text"
        v-model="uiStore.varFilterQ"
        :placeholder="uiStore.t('preset.varPanel.filter')"
      />
      <button class="wb-btn sm" @click="uiStore.rebuildVarIndex()">🔄</button>
    </div>
    <div class="wb-rp-nav">
      <button class="wb-btn" @click="uiStore.navVar(-1, 'local')">
        {{ uiStore.t('preset.varPanel.prev') }}
      </button>
      <button class="wb-btn" @click="uiStore.navVar(1, 'local')">
        {{ uiStore.t('preset.varPanel.next') }}
      </button>
      <span class="wb-search-count"
        >{{ uiStore.localFiltered.length }}/{{ uiStore.localRefs.length }} · G{{
          uiStore.globalFiltered.length
        }}/{{ uiStore.globalRefs.length }}</span
      >
    </div>
    <div class="wb-rp-list wb-vr-list">
      <!-- LOCAL 分区 -->
      <div class="wb-vr-section">
        {{ uiStore.t('preset.varPanel.local') }}
      </div>
      <template v-for="(v, i) in uiStore.localFiltered" :key="'l' + i">
        <div
          v-if="i === 0 || v.varName !== uiStore.localFiltered[i - 1].varName"
          class="wb-vr-group"
        >
          {{ v.varName }}
        </div>
        <div
          class="wb-vr-item"
          :class="{ active: i === uiStore.varIdx, dim: !v.certain }"
          @click="uiStore.jumpToVarOp(v)"
        >
          <span class="wb-vr-type" :class="varOpBadge(v.kind).cls">{{
            varOpBadge(v.kind).label
          }}</span>
          <span class="wb-var-name-em">{{ v.varName }}</span>
          <span class="wb-vr-block">[{{ v.source.blockLabel }}]</span>
        </div>
      </template>
      <!-- GLOBAL 分区 -->
      <div class="wb-vr-section">
        {{ uiStore.t('preset.varPanel.global') }}
      </div>
      <template v-for="(v, i) in uiStore.globalFiltered" :key="'g' + i">
        <div
          v-if="i === 0 || v.varName !== uiStore.globalFiltered[i - 1].varName"
          class="wb-vr-group"
        >
          {{ v.varName }}
        </div>
        <div
          class="wb-vr-item"
          :class="{ active: 'g' + i === String(uiStore.varIdx), dim: !v.certain }"
          @click="uiStore.jumpToVarOp(v)"
        >
          <span class="wb-vr-type" :class="varOpBadge(v.kind).cls">{{
            varOpBadge(v.kind).label
          }}</span>
          <span class="wb-var-name-em">{{ v.varName }}</span>
          <span class="wb-vr-block">[{{ v.source.blockLabel }}]</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useUiStore } from '../../stores/uiStore';
import { usePanelResize } from '../../composables/usePanelResize';
import { varOpBadge } from '../../utils';

const uiStore = useUiStore();

const resize = usePanelResize({
  getWidth: () => uiStore.settings.varPanelWidth,
  setWidth: (w) => {
    uiStore.settings.varPanelWidth = w;
  },
  min: 240,
  max: 800,
  dir: 'left',
});
watch(
  () => resize.active.value,
  (v) => {
    if (!v) uiStore.saveSettings();
  }
);

function toggleFloat() {
  uiStore.settings.varPanelFloat = !uiStore.settings.varPanelFloat;
  uiStore.saveSettings();
}
</script>
