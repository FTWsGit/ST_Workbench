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
/** 可折叠分组。不做跨实例/跨会话的展开状态持久化，每个实例自持 open ref，销毁即重置（与原先"切条目重渲染=收起"行为一致）。 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  /** 默认是否展开，默认 false。 */
  defaultOpen?: boolean
}>(), { defaultOpen: false })

const open = ref(props.defaultOpen)
</script>
