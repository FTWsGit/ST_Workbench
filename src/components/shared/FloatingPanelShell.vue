<template>
  <!-- 移动端专属遮罩：窗口贴底占满大半屏，加一层可点击关闭遮罩，与其他 bottom sheet 手感一致；桌面端无遮罩，悬浮窗可与编辑区并存。 -->
  <div v-if="isMobile" class="wb-float-mobile-backdrop" @click="$emit('close')"></div>
  <div
    class="wb-float-shell"
    :class="{ mobile: isMobile, dragging }"
    :style="style"
    @pointerdown="bringToFront"
  >
    <div class="wb-float-header" @pointerdown="onDragStart">
      <span class="wb-float-title"><slot name="title">{{ title }}</slot></span>
      <button class="wb-btn close-btn" :title="closeTitle" :aria-label="closeTitle" @click="$emit('close')">✕</button>
    </div>
    <div class="wb-float-body">
      <slot />
    </div>
    <div v-if="!isMobile" class="wb-float-resize-handle" @pointerdown.stop="onResizeStart">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
/** 悬浮窗 Shell：可拖拽定位、可 resize、多开自动置顶，移动端变 bottom sheet。
 *  机制在 useFloatingPanel.ts 中，本组件只负责渲染 header/body/resize 手柄与移动端遮罩。
 *  桌面端无遮罩（非模态，可与主编辑区并存）；关闭前如需确认由调用方在 @close 自行判断。 */
import { useFloatingPanel, type UseFloatingPanelOptions } from '../../composables/useFloatingPanel'

const props = withDefaults(defineProps<{
  title?: string
  /** 关闭按钮 title 提示，调用方传入 i18n 文案（组件不内置语言）。 */
  closeTitle?: string
} & UseFloatingPanelOptions>(), {
  title: '',
  closeTitle: 'Close',
})

defineEmits<{ close: [] }>()

const { isMobile, style, dragging, bringToFront, onDragStart, onResizeStart } = useFloatingPanel(props)
</script>
