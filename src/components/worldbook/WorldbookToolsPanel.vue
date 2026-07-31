<template>
  <FloatingPanelShell
    :title="uiStore.t('worldbook.tools.title')"
    :close-title="uiStore.t('common.close')"
    :width="380" :height="320" :min-width="300" :min-height="220"
    @close="emit('close')">
    <div class="wb-tools-body">
      <p class="wb-muted">{{ uiStore.t('worldbook.tools.selectedCount', { count: selectedIds.length }) }}</p>

      <div class="wb-tools-section">
        <FormField :label="uiStore.t('worldbook.tools.enableLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setDisabled(false)">{{ uiStore.t('worldbook.tools.enableSelected') }}</button>
            <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setDisabled(true)">{{ uiStore.t('worldbook.tools.disableSelected') }}</button>
          </div>
        </FormField>
      </div>

      <div class="wb-tools-section">
        <FormField :label="uiStore.t('worldbook.tools.activationLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('keyWord')">{{ uiStore.t('worldbook.activation.keyWord') }}</button>
            <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('constant')">{{ uiStore.t('worldbook.activation.constant') }}</button>
            <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('vectorized')">{{ uiStore.t('worldbook.activation.vectorized') }}</button>
          </div>
        </FormField>
      </div>

      <p v-if="!selectedIds.length" class="wb-muted">{{ uiStore.t('worldbook.tools.noSelection') }}</p>
    </div>
  </FloatingPanelShell>
</template>

<script setup lang="ts">
/** 世界书批量工具面板：批量启用/禁用、批量改激活方式，作用于侧边栏当前选中的行；若选中的是组，展开为组内全部条目。复用 FloatingPanelShell。 */
import { computed } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useUiStore } from '../../stores/uiStore'
import type { OrderItem, OrderGroup } from '../../types'
import FloatingPanelShell from '../shared/FloatingPanelShell.vue'
import FormField from '../shared/FormField.vue'

const emit = defineEmits<{ close: [] }>()
const store = useWorldbookStore()
const uiStore = useUiStore()

/** 选中条目 id：组展开为子条目 id。 */
const selectedIds = computed<string[]>(() => {
  const ids = new Set<string>()
  for (const gi of store.selectedGi) {
    const node = store.flatNodes[gi]
    if (!node) continue
    if (node.isGroup) (node.ref as OrderGroup).children.forEach(c => ids.add(c.identifier))
    else ids.add((node.ref as OrderItem).identifier)
  }
  return Array.from(ids)
})

function selectedEntries() {
  const ids = new Set(selectedIds.value)
  return store.entries.filter(e => ids.has(String(e.uid)))
}

function setDisabled(disabled: boolean) {
  selectedEntries().forEach(e => { e.disabled = disabled })
  store.markDirty()
  uiStore.showToast(uiStore.t('worldbook.tools.applied', { count: selectedIds.value.length }))
}

function setActivation(mode: 'keyWord' | 'constant' | 'vectorized') {
  selectedEntries().forEach(e => {
    e.constant = mode === 'constant'
    e.vectorized = mode === 'vectorized'
    e.keyWord = mode === 'keyWord'
  })
  store.markDirty()
  uiStore.showToast(uiStore.t('worldbook.tools.applied', { count: selectedIds.value.length }))
}
</script>
