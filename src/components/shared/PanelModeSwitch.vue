<template>
  <div class="wb-mode-seg" role="group" :aria-label="uiStore.t('shared.panelMode.ariaLabel')">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="wb-mode-seg-btn"
      :class="{ active: modelValue === opt.value }"
      :title="uiStore.t(opt.tooltip)"
      :aria-label="uiStore.t(opt.tooltip)"
      :aria-pressed="modelValue === opt.value"
      @click="$emit('update:modelValue', opt.value)"
    >
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
        <path :d="opt.icon" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
        <path v-if="opt.iconFill" :d="opt.iconFill" fill="currentColor" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
/** 面板三态切换：挤开（docked）/ 右侧悬浮（overlay）/ 完全悬浮（float）。
 *  三个图标共用一个胶囊容器，无文字；tooltip 给完整语义。
 *  docked=嵌入布局流挤开编辑区；overlay=盖在右侧不挤开；float=FloatingPanelShell 接管。 */
import { useUiStore } from '../../stores/uiStore'
import type { PanelMode } from '../../types'
import type { LocaleKey } from '../../i18n'

defineProps<{
  modelValue: PanelMode
}>()

defineEmits<{ 'update:modelValue': [v: PanelMode] }>()

const uiStore = useUiStore()

const options: { value: PanelMode; tooltip: LocaleKey; icon: string; iconFill?: string }[] = [
  {
    value: 'docked',
    tooltip: 'shared.panelMode.tooltip.docked',
    // 右侧实心矩形挤在布局里
    icon: 'M2 3.5h12v9H2z',
    iconFill: 'M9.5 5h3.5v6H9.5z',
  },
  {
    value: 'overlay',
    tooltip: 'shared.panelMode.tooltip.overlay',
    // 右侧悬浮矩形浮在虚线背景上
    icon: 'M2 3.5h12v9H2z',
    iconFill: 'M9.5 5h3.5v6H9.5z',
  },
  {
    value: 'float',
    tooltip: 'shared.panelMode.tooltip.float',
    // 独立悬浮窗：带标题栏的小窗口
    icon: 'M3 5.5h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z',
    iconFill: 'M2.4 5.5h9.2v1.6H2.4z',
  },
]
</script>
