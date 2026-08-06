<template>
  <div class="wb-panel-mode-switch">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="wb-btn sm"
      :class="{ active: modelValue === opt.value }"
      :title="uiStore.t(opt.tooltip)"
      :aria-label="uiStore.t(opt.tooltip)"
      @click="$emit('update:modelValue', opt.value)"
    >{{ uiStore.t(opt.label) }}</button>
  </div>
</template>

<script setup lang="ts">
/** 面板三态切换：右侧挤开（docked）/ 右侧悬浮（overlay）/ 完全悬浮（float）。
 *  三个短 label + 完整 tooltip；docked 嵌入布局流挤开编辑区，overlay 盖在右侧不挤开，
 *  float 由 FloatingPanelShell 接管（可拖拽/缩放，移动端变 bottom sheet）。 */
import { useUiStore } from '../../stores/uiStore'
import type { PanelMode } from '../../types'
import type { LocaleKey } from '../../i18n'

defineProps<{
  modelValue: PanelMode
}>()

defineEmits<{ 'update:modelValue': [v: PanelMode] }>()

const uiStore = useUiStore()

const options: { value: PanelMode; label: LocaleKey; tooltip: LocaleKey }[] = [
  { value: 'docked', label: 'shared.panelMode.docked', tooltip: 'shared.panelMode.tooltip.docked' },
  { value: 'overlay', label: 'shared.panelMode.overlay', tooltip: 'shared.panelMode.tooltip.overlay' },
  { value: 'float', label: 'shared.panelMode.float', tooltip: 'shared.panelMode.tooltip.float' },
]
</script>
