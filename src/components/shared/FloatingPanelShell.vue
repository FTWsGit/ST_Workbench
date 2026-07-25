<template>
  <!-- 移动端专属遮罩：桌面端悬浮窗不遮别的东西（可以一边拖窗口一边继续看后面的编辑器），只有
       移动端因为窗口本身贴底占满大半屏、跟"背后还能看到什么"已经没什么意义了，才比照 App.vue
       现有的抽屉/bottom sheet 一样加一层可点击关闭的遮罩，维持跟其它移动端 sheet 一致的手感。 -->
  <div v-if="isMobile" class="wb-float-mobile-backdrop" @click="$emit('close')"></div>
  <div
    class="wb-float-shell"
    :class="{ mobile: isMobile, dragging }"
    :style="style"
    @pointerdown="bringToFront"
  >
    <div class="wb-float-header" @pointerdown="onDragStart">
      <span class="wb-float-title"><slot name="title">{{ title }}</slot></span>
      <button class="wb-btn close-btn" :title="closeTitle" @click="$emit('close')">✕</button>
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
/* ====== 悬浮窗 Shell ======
 * 真正可拖拽定位/可 resize/多开自动置顶/移动端变 bottom sheet 的悬浮窗容器——机制全在
 * useFloatingPanel.ts 里，这个组件只负责渲染 header（标题+拖拽把手+关闭按钮）/body（内容 slot）/
 * 右下角 resize 手柄这三块，以及移动端的遮罩。
 *
 * 从 CopyPanel.vue 原来写死的 `.wb-modal-overlay` + `.wb-modal`（居中定死、不能拖不能resize、
 * 点遮罩关闭）里抽出来，见 TODO.md 阶段0「抽悬浮窗 Shell 组件」。CopyPanel.vue 是第一个接回来验证
 * 的调用方，以后 MetaPanel.vue（阶段2）/ToolsPanel.vue（阶段1）直接复用这个组件，不用各自重新
 * 发明一套定位/resize/z-index 逻辑。
 *
 * 故意去掉了原来"点击遮罩关闭"的模态行为——桌面端这里根本没有遮罩（见下），悬浮窗被设计成可以
 * 跟主编辑区同时存在、互不遮挡阅读，不是传统意义上"打断一切"的 modal，只有关闭按钮（和移动端的
 * 遮罩点击，纯粹是照顾小屏没地方放"一直可见的关闭按钮"这个手感缺口）会真正关它。是否需要在关闭前
 * 弹确认（比如有未保存改动）完全交给调用方在 @close 里自己判断——Shell 不知道调用方内部有没有
 * 脏数据。 */
import { useFloatingPanel, type UseFloatingPanelOptions } from '../../composables/useFloatingPanel'

const props = withDefaults(defineProps<{
  title?: string
  /** 关闭按钮的 title 提示文字，调用方传自己的 i18n 文案进来（Shell 本身不内置任何语言）。 */
  closeTitle?: string
} & UseFloatingPanelOptions>(), {
  title: '',
  closeTitle: 'Close',
})

defineEmits<{ close: [] }>()

const { isMobile, style, dragging, bringToFront, onDragStart, onResizeStart } = useFloatingPanel(props)
</script>
