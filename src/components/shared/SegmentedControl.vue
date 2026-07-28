<template>
  <div class="rx-surface">
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      class="wb-btn sm"
      :class="{ active: opt.value === modelValue }"
      @click="emit('update:modelValue', opt.value)"
    >{{ opt.label }}</button>
  </div>
</template>

<script setup lang="ts">
/* 短选项 select 换成分段按钮——.rx-surface + .wb-btn.sm 这个组合样式在同一批表单里已经用在
 * "激活方式"（关键词/恒定/向量化）和"表层替换"（仅显示/仅提示词/两者）上了，这里只是把它
 * 抽成一个通用组件，故意不新增任何 CSS 类，完全复用现成样式，跟已有的视觉语言零差异。
 *
 * 只用于选项数量少（2-4 个）且标签短的字段（区分大小写/全词匹配/正则替换宏这种）。选项多的
 * （插入位置 8 项、逻辑 4 项标签偏长）继续用 <select>，硬塞进分段按钮只会换个方式挤成一团，
 * 不是"选项少就一定要用按钮"，是"按钮排得下才用按钮"。 */
type OptionValue = string | number | boolean | null

defineProps<{
  modelValue: OptionValue
  options: { value: OptionValue; label: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: OptionValue] }>()
</script>
