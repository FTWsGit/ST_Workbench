<template>
  <div v-if="inline" class="wb-field-row">
    <label v-if="label" class="wb-form-label">{{ label }}</label>
    <slot />
  </div>
  <template v-else>
    <label v-if="label" class="wb-form-label">{{ label }}</label>
    <slot />
  </template>
</template>

<script setup lang="ts">
/** "一个 label + 一个控件"的通用表单行封装。
 *  - inline=true：label 与控件同一行（.wb-field-row）；
 *  - inline=false（默认）：竖排，label 单独一行。
 *  间距/首项 margin 清零交由 main.css 结构选择器自动处理，调用方无需关心。
 *  v-else 分支用 <template> 多根节点而非包一层 div，避免打乱父容器 flex 间距。 */
withDefaults(defineProps<{
  /** 字段标签文字；不传则不渲染 label（如"启用"这类控件自带语义的场景）。 */
  label?: string
  /** true 同行横排，false（默认）竖排。 */
  inline?: boolean
}>(), { inline: false })
</script>
