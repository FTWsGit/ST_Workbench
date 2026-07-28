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
/* 原生 number input 之外叠一个拖拽手柄，不是替换原生输入——键盘输入/上下箭头/滚轮该怎么用
 * 还怎么用，拖拽只是多一种改数值的方式。
 *
 * 关于 markDirty 委托：WorldbookSettingsForm.vue 的字段脏检查是靠表单根节点的 @change/@input
 * 事件委托兜底的（见那个文件顶部的大段 doc comment），拖拽改值是 useNumberDragScrub 直接调
 * set()，不经过用户在 <input> 上打字这条路，如果只 emit('update:modelValue') 而不摸那个
 * <input> 元素本身，这次改动永远不会以一个真实 DOM input 事件的身份出现，委托会漏掉。所以
 * set() 里手动改 inputEl.value 的值 + dispatchEvent(new Event('input', {bubbles:true}))，
 * 让拖拽出来的改动跟手打的改动走同一条路径（都触发 onNativeInput → 都会冒泡到 rx-form 根
 * 节点），而不是维护两条平行的"改值"逻辑。 */
import { ref } from 'vue'
import { useNumberDragScrub } from '../../composables/useNumberDragScrub'

const props = withDefaults(defineProps<{
  modelValue: number | null
  step?: number
  min?: number
  max?: number
  placeholder?: string
  /** 是否允许清空为 null（比如"跟随全局设置"用 null 占位），默认允许；关掉后清空回落到 0 */
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
