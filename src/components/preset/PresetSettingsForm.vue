<template>
  <div v-if="store.currentBlock" class="rx-form">
    <label class="rx-label" style="margin-top:0">{{ uiStore.t('preset.settings.name') }}</label>
    <input class="rx-input" type="text" :value="store.currentBlock.name" @input="onNameInput" :placeholder="uiStore.t('preset.settings.namePlaceholder')" />

    <label class="rx-label">{{ uiStore.t('preset.settings.role') }}</label>
    <select class="rx-input" :value="store.currentBlock.role" @change="onRoleChange">
      <option value="system">system</option>
      <option value="user">user</option>
      <option value="assistant">assistant</option>
    </select>

    <p v-if="store.currentBlock.marker" class="wb-muted" style="font-size:12px;margin-top:10px">
      {{ uiStore.t('preset.settings.markerHint', { id: store.currentBlock.identifier }) }}
    </p>
  </div>
  <p v-else class="wb-empty-note">{{ uiStore.t('preset.settings.empty') }}</p>
</template>

<script setup lang="ts">
// 对称于 RegexSettingsForm.vue：block 域的设置表单。store.currentBlock 是指向 prompts 数组里
// 对应元素的活引用（直接从激活标签的 key 解析，见 presetStore.ts 的 currentBlock computed），
// 直接改它的字段就会同步进 prompts/dirty 追踪，不需要像 HighlightedEditor 那样维护本地 ref
// 做防抖/高亮批处理——name/role 不是高频输入的热路径，没有那个必要。
import { watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'

const store = usePresetStore()
const uiStore = useUiStore()
const tabsStore = useTabsStore()

function onNameInput(e: Event) {
  if (!store.currentBlock) return
  store.currentBlock.name = (e.target as HTMLInputElement).value
  store.markDirty()
}
function onRoleChange(e: Event) {
  if (!store.currentBlock) return
  store.currentBlock.role = (e.target as HTMLSelectElement).value as any
  store.markDirty()
}

// 对称于 RegexSettingsForm.vue 的同名 watch：改名了就同步已开标签的文字，用 renameTab()
// 而不是 open()，避免逐字触发侧边栏 scrollIntoView。之前这里完全没有同步逻辑——block 标签
// 改名后标签栏文字会一直显示旧名字，是个真实存在但没被单独提过的小 bug，顺手一起修了。
watch(() => store.currentBlock?.name, (name) => {
  const b = store.currentBlock
  if (b && name !== undefined) tabsStore.renameTab('preset', b.identifier, name || b.identifier)
})
</script>
