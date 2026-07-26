<template>
  <FloatingPanelShell
    :title="store.t('worldbook.tools.title')"
    :close-title="store.t('common.close')"
    :width="380" :height="320" :min-width="300" :min-height="220"
    @close="emit('close')">
    <div class="wb-tools-body">
      <p class="wb-muted">{{ store.t('worldbook.tools.selectedCount', { count: selectedIds.length }) }}</p>

      <div class="wb-tools-section">
        <label class="rx-label" style="margin:0">{{ store.t('worldbook.tools.enableLabel') }}</label>
        <div class="rx-surface">
          <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setDisabled(false)">{{ store.t('worldbook.tools.enableSelected') }}</button>
          <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setDisabled(true)">{{ store.t('worldbook.tools.disableSelected') }}</button>
        </div>
      </div>

      <div class="wb-tools-section">
        <label class="rx-label" style="margin:0">{{ store.t('worldbook.tools.activationLabel') }}</label>
        <div class="rx-surface">
          <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('keyWord')">{{ store.t('worldbook.activation.keyWord') }}</button>
          <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('constant')">{{ store.t('worldbook.activation.constant') }}</button>
          <button class="wb-btn sm" :disabled="!selectedIds.length" @click="setActivation('vectorized')">{{ store.t('worldbook.activation.vectorized') }}</button>
        </div>
      </div>

      <p v-if="!selectedIds.length" class="wb-muted">{{ store.t('worldbook.tools.noSelection') }}</p>
    </div>
  </FloatingPanelShell>
</template>

<script setup lang="ts">
/* 世界书批量工具面板（TODO.md 阶段1最后一项）：批量启用/禁用、批量改激活方式，作用对象是侧边栏
 * 当前选中的行——选中的是组的话，展开成组内全部条目一起处理。复用 FloatingPanelShell（阶段0从
 * CopyPanel.vue 里抽出来的悬浮窗容器），不用另发明一套定位/拖拽/resize 逻辑，见
 * FloatingPanelShell.vue 顶部 doc comment。 */
import { computed } from 'vue'
import { useWorldbookStore } from '../../stores/worldbookStore'
import type { OrderItem, OrderGroup } from '../../types'
import FloatingPanelShell from '../shared/FloatingPanelShell.vue'

const emit = defineEmits<{ close: [] }>()
const store = useWorldbookStore()

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
  store.showToast(store.t('worldbook.tools.applied', { count: selectedIds.value.length }))
}

function setActivation(mode: 'keyWord' | 'constant' | 'vectorized') {
  selectedEntries().forEach(e => {
    e.constant = mode === 'constant'
    e.vectorized = mode === 'vectorized'
    e.keyWord = mode === 'keyWord'
  })
  store.markDirty()
  store.showToast(store.t('worldbook.tools.applied', { count: selectedIds.value.length }))
}
</script>
