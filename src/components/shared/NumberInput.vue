<template>
  <div class="wb-num-wrap" :class="{ dragging }">
    <input
      ref="inputEl"
      class="rx-input rx-num"
      type="number"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step ?? 1"
      @input="onNativeInput"
    />
    <span class="wb-num-handle" title="拖拽调整数值（按住 Shift 精细调整）" @pointerdown="onPointerDown">⠿</span>
  </div>
</template>

<script setup lang="ts">
/** 数字输入框：原生 number input + 右侧拖拽手柄。键盘/滚轮/上下箭头照常使用；拖拽只是额外改值方式。
 *  拖拽 set() 会手动写 inputEl.value 并派发 input 事件，以冒泡到父容器的 @change/@input 事件委托（脏检查）路径，
 *  避免与手输改值走两套逻辑。 */
import { ref } from 'vue'
import { useNumberDragScrub } from '../../composables/useNumberDragScrub'

const props = withDefaults(defineProps<{
  modelValue: number | null
  step?: number
  min?: number
  max?: number
  placeholder?: string
  /** 是否允许清空为 null（如"跟随全局设置"），默认允许；关闭后清空回落到 0。 */
  nullable?: boolean
}>(), { nullable: true })

const emit = defineEmits<{ 'update:modelValue': [v: number | null] }>()

const inputEl = ref<HTMLInputElement | null>(null)

function parse(raw: string): number | null {
  if (raw === '') return props.nullable ? null : 0
  const n = Number(raw)
  return Number.isNaN(n) ? (props.nullable ? null : 0) : n
}

function onNativeInput(e: Event) {
  emit('update:modelValue', parse((e.target as HTMLInputElement).value))
}

const { dragging, onPointerDown } = useNumberDragScrub({
  get: () => props.modelValue,
  set: (v) => {
    if (!inputEl.value) return
    inputEl.value.value = String(v)
    inputEl.value.dispatchEvent(new Event('input', { bubbles: true }))
  },
  step: props.step,
  min: props.min,
  max: props.max,
})
</script>
