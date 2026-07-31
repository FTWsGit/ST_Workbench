<template>
  <div class="wb-regex-surface">
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
/** 分段按钮（Segmented Control）：用于 2-4 个短选项的枚举选择，完全复用 .wb-regex-surface + .wb-btn.sm 样式，不新增 CSS。
 *  选项多或标签长的字段仍用 <select>。 */
type OptionValue = string | number | boolean | null

defineProps<{
  modelValue: OptionValue
  options: { value: OptionValue; label: string }[]
}>()

const emit = defineEmits<{ 'update:modelValue': [v: OptionValue] }>()
</script>
