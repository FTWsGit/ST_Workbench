<template>
  <div class="wb-group" :class="{ open }">
    <button type="button" class="wb-group-head" @click="open = !open">
      <span class="wb-group-chevron">▸</span>
      <span class="wb-group-title">{{ title }}</span>
    </button>
    <div v-if="open" class="wb-group-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/* 可折叠设置分组——原来 WorldbookSettingsForm.vue / RegexSettingsForm.vue 各自手写一份
 * "wb-advanced-toggle 按钮 + advancedOpen ref + v-if rx-advanced" 的三件套，且都只用一次
 * （整坨"高级选项"堆一起）。抽出来是因为 worldbook 那边要拆成 4 个分组（激活策略/插入位置/
 * 递归与匹配/特殊效果），照抄 3 份没意义；regex 那边继续只用 1 个，直接换皮不改行为。
 *
 * 不做全局单例展开状态管理（比如"记住上次哪个组是展开的"），每个实例自己持有 open 这个 ref，
 * 组件销毁就重置——跟原来 advancedOpen 的行为一致（切换条目=组件重新渲染=重新收起），没有
 * 理由在这层加持久化，加了反而是没人要求的行为变化。 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  /** 默认是否展开，默认 false（跟原来 advancedOpen 初始值一致） */
  defaultOpen?: boolean
}>(), { defaultOpen: false })

const open = ref(props.defaultOpen)
</script>
