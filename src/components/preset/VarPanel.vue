<template>
  <div class="wb-right-panel" :class="{ float: uiStore.settings.varPanelFloat }" :style="{ width: uiStore.settings.varPanelWidth + 'px' }">
    <div class="wb-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="wb-rp-header">
      <span>{{ uiStore.t('preset.varPanel.title') }}</span>
      <div class="wb-row-tight">
        <button class="wb-btn icon-btn" :class="{ active: uiStore.settings.varPanelFloat }" :title="uiStore.t('shared.floatingPanel.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="wb-btn close-btn compact" @click="tabsStore.setVarNavOpen('preset', false)">✕</button>
      </div>
    </div>
    <div class="wb-rp-tools">
      <input type="text" v-model="store.varFilterQ" :placeholder="uiStore.t('preset.varPanel.filter')" />
      <button class="wb-btn sm" @click="store.rebuildVarIndex()">🔄</button>
    </div>
    <div class="wb-rp-nav">
      <button class="wb-btn" @click="store.navVar(-1)">{{ uiStore.t('preset.varPanel.prev') }}</button>
      <button class="wb-btn" @click="store.navVar(1)">{{ uiStore.t('preset.varPanel.next') }}</button>
      <span class="pr-search-count">{{ store.filteredVarOps.length }}/{{ store.allVarOps.length }}</span>
    </div>
    <div class="wb-rp-list">
      <template v-for="(v, i) in store.filteredVarOps" :key="i">
        <div v-if="i === 0 || v.varName !== store.filteredVarOps[i - 1].varName" class="pr-vr-group">{{ v.varName }}</div>
        <div class="pr-vr-item" :class="{ active: i === store.varIdx }" @click="store.jumpToVarOp(i)">
          <span class="pr-vr-type" :class="varOpBadge(v.type).cls">{{ varOpBadge(v.type).label }}</span>
          <span class="wb-var-name-em">{{ v.varName }}</span>
          <span v-if="v.varValue" class="pr-vr-val">{{ v.varValue.length > 35 ? v.varValue.substring(0, 35) + '…' : v.varValue }}</span>
          <span class="pr-vr-block">[{{ v.blockName }}]</span>
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
// varNavOpen 本身的开关状态活在 tabsStore（按 workspace 分桶存，见该文件 doc comment）——这个
// 面板目前只对 'preset' 工作区渲染（App.vue 按 workspaceRegistry.capabilities.varNav 挂载），
// 关闭时写回的 workspace 硬编码成 'preset' 没问题；哪天 varNav 也要支持别的 workspace，这里要
// 跟着改成读 tabsStore.activeWorkspace。
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
