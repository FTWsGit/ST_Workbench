<template>
  <div class="wb-right-panel" :class="{ float: uiStore.settings.varPanelFloat }" :style="{ width: uiStore.settings.varPanelWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('preset.varPanel.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.varPanelFloat }" :title="uiStore.t('shared.floatingPanel.toggleFloat')" :aria-label="uiStore.t('shared.floatingPanel.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" :aria-label="uiStore.t('common.close')" @click="tabsStore.setVarNavOpen(tabsStore.activeWorkspace, false)">✕</button>
      </div>
    </div>
    <div class="wb-rp-tools">
      <input type="text" v-model="store.varFilterQ" :placeholder="uiStore.t('preset.varPanel.filter')" />
      <button class="wb-btn sm" @click="store.rebuildVarIndex()">🔄</button>
    </div>
    <div class="wb-rp-nav">
      <button class="wb-btn" @click="store.navVar(-1, 'local')">{{ uiStore.t('preset.varPanel.prev') }}</button>
      <button class="wb-btn" @click="store.navVar(1, 'local')">{{ uiStore.t('preset.varPanel.next') }}</button>
      <span class="wb-preset-search-count">{{ store.localFiltered.length }}/{{ store.localRefs.length }} · G{{ store.globalFiltered.length }}/{{ store.globalRefs.length }}</span>
    </div>
    <div class="wb-rp-list wb-preset-vr-list">
      <!-- LOCAL 分区 -->
      <div class="wb-preset-vr-section">{{ uiStore.t('preset.varPanel.local') }}</div>
      <template v-for="(v, i) in store.localFiltered" :key="'l' + i">
        <div v-if="i === 0 || v.varName !== store.localFiltered[i - 1].varName" class="wb-preset-vr-group">{{ v.varName }}</div>
        <div class="wb-preset-vr-item" :class="{ active: i === store.varIdx, dim: !v.certain }" @click="store.jumpToVarOp(v)">
          <span class="wb-preset-vr-type" :class="varOpBadge(v.kind).cls">{{ varOpBadge(v.kind).label }}</span>
          <span class="wb-var-name-em">{{ v.varName }}</span>
          <span class="wb-preset-vr-block">[{{ v.source.blockLabel }}]</span>
        </div>
      </template>
      <!-- GLOBAL 分区 -->
      <div class="wb-preset-vr-section">{{ uiStore.t('preset.varPanel.global') }}</div>
      <template v-for="(v, i) in store.globalFiltered" :key="'g' + i">
        <div v-if="i === 0 || v.varName !== store.globalFiltered[i - 1].varName" class="wb-preset-vr-group">{{ v.varName }}</div>
        <div class="wb-preset-vr-item" :class="{ active: 'g' + i === String(store.varIdx), dim: !v.certain }" @click="store.jumpToVarOp(v)">
          <span class="wb-preset-vr-type" :class="varOpBadge(v.kind).cls">{{ varOpBadge(v.kind).label }}</span>
          <span class="wb-var-name-em">{{ v.varName }}</span>
          <span class="wb-preset-vr-block">[{{ v.source.blockLabel }}]</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { usePanelResize } from '../../composables/usePanelResize'
import { varOpBadge } from '../../utils'

const store = usePresetStore()
const uiStore = useUiStore()
/** varNavOpen 按 workspace 分桶存于 tabsStore；本面板目前仅对 'preset' 工作区渲染，关闭时硬编码 'preset' 即可，若未来支持其他 workspace 需改为读 activeWorkspace。 */
const tabsStore = useTabsStore()

const resize = usePanelResize({
  getWidth: () => uiStore.settings.varPanelWidth,
  setWidth: (w) => { uiStore.settings.varPanelWidth = w },
  min: 240, max: 800, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) uiStore.saveSettings() })

function toggleFloat() {
  uiStore.settings.varPanelFloat = !uiStore.settings.varPanelFloat
  uiStore.saveSettings()
}
</script>
