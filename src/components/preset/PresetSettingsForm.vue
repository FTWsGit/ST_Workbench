<template>
  <div v-if="store.currentBlock" class="wb-form">
    <FormField :label="uiStore.t('preset.settings.name')">
      <input class="wb-form-input" type="text" :value="store.currentBlock.name" @input="onNameInput" :placeholder="uiStore.t('preset.settings.namePlaceholder')" />
    </FormField>

    <FormField :label="uiStore.t('preset.settings.role')">
      <select class="wb-form-input" :value="store.currentBlock.role" @change="onRoleChange">
        <option value="system">system</option>
        <option value="user">user</option>
        <option value="assistant">assistant</option>
      </select>
    </FormField>

    <p v-if="store.currentBlock.marker" class="wb-muted" style="font-size:12px;margin-top:10px">
      {{ uiStore.t('preset.settings.markerHint', { id: store.currentBlock.identifier }) }}
    </p>
  </div>
  <p v-else class="wb-empty-note">{{ uiStore.t('preset.settings.empty') }}</p>
</template>

<script setup lang="ts">
/** 预设 block 域设置表单（name/role）。store.currentBlock 是 prompts 数组元素的活引用，直接改字段即同步到 dirty 追踪；
 *  name/role 非高频输入，无需本地 ref 防抖。 */
import { watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import FormField from '../shared/FormField.vue'

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

/** block 改名时同步标签栏文字；用 renameTab() 而非 open()，避免逐字触发侧边栏 scrollIntoView。 */
watch(() => store.currentBlock?.name, (name) => {
  const b = store.currentBlock
  if (b && name !== undefined) tabsStore.renameTab('preset', b.identifier, name || b.identifier)
})
</script>
