<template>
  <div class="wb-tools-body">
    <p v-if="isNoBatchScene" class="wb-muted">{{ uiStore.t('toolbox.batch.noBatchTools') }}</p>

    <template v-else>
      <p class="wb-muted">{{ uiStore.t('toolbox.batch.selectedCount', { count: selectedCount }) }}</p>

      <!-- regex scene：选中态来自 SearchTool.selectSide 同步（tabsStore 共享态），对齐其他 scene -->
      <div v-if="isRegex" class="wb-tools-section">
        <FormField :label="uiStore.t('toolbox.batch.enableLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedCount" @click="regexSetDisabled(false)">{{ uiStore.t('toolbox.batch.enableSelected') }}</button>
            <button class="wb-btn sm" :disabled="!selectedCount" @click="regexSetDisabled(true)">{{ uiStore.t('toolbox.batch.disableSelected') }}</button>
          </div>
        </FormField>
      </div>

      <!-- preset/items：批量启用/禁用 + 批量改 role -->
      <div v-else-if="isPresetItems" class="wb-tools-section">
        <FormField :label="uiStore.t('toolbox.batch.enableLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedCount" @click="presetSetEnabled(true)">{{ uiStore.t('toolbox.batch.enableSelected') }}</button>
            <button class="wb-btn sm" :disabled="!selectedCount" @click="presetSetEnabled(false)">{{ uiStore.t('toolbox.batch.disableSelected') }}</button>
          </div>
        </FormField>
        <FormField :label="uiStore.t('toolbox.batch.roleLabel')">
          <div class="wb-regex-surface">
            <button v-for="r in ROLES" :key="r" class="wb-btn sm" :disabled="!selectedCount" @click="presetSetRole(r)">{{ r }}</button>
          </div>
        </FormField>
      </div>

      <!-- worldbook/items：批量启用/禁用 + 批量改激活方式（三态互斥：keyWord/constant/vectorized） -->
      <div v-else-if="isWorldbookItems" class="wb-tools-section">
        <FormField :label="uiStore.t('toolbox.batch.enableLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedCount" @click="wbSetDisabled(false)">{{ uiStore.t('toolbox.batch.enableSelected') }}</button>
            <button class="wb-btn sm" :disabled="!selectedCount" @click="wbSetDisabled(true)">{{ uiStore.t('toolbox.batch.disableSelected') }}</button>
          </div>
        </FormField>
        <FormField :label="uiStore.t('toolbox.batch.activationLabel')">
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedCount" @click="wbSetActivation('keyWord')">{{ uiStore.t('worldbook.activation.keyWord') }}</button>
            <button class="wb-btn sm" :disabled="!selectedCount" @click="wbSetActivation('constant')">{{ uiStore.t('worldbook.activation.constant') }}</button>
            <button class="wb-btn sm" :disabled="!selectedCount" @click="wbSetActivation('vectorized')">{{ uiStore.t('worldbook.activation.vectorized') }}</button>
          </div>
        </FormField>
      </div>

      <!-- 批量删除（preset/items、regex、worldbook/items 都有） -->
      <div class="wb-tools-section">
        <FormField>
          <div class="wb-regex-surface">
            <button class="wb-btn sm" :disabled="!selectedCount" @click="deleteSelected()">{{ uiStore.t('toolbox.batch.deleteSelected') }}</button>
          </div>
        </FormField>
      </div>

      <p v-if="!selectedCount" class="wb-muted">{{ uiStore.t('toolbox.batch.noSelection') }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/** 工具箱批量工具：按 scene 给出批量操作。
 *  - preset/items：批量启用/禁用（改 OrderItem.enabled）+ 批量改 role（改 prompts[i].role）+ 批量删除
 *  - regex（preset/character 工作区）：侧边栏无 useGroupedList 多选态，选中态由 SearchTool.selectSide
 *    同步进 tabsStore 共享态，BatchTool 读这份态做启用/禁用 + 删除（对齐其他 scene，不自带勾选 UI）
 *  - worldbook/items：批量启用/禁用 + 批量改激活方式（三态互斥）+ 批量删除
 *  - character/fields：无批量工具，显示占位提示
 *  删除统一 confirmStore.ask 确认一次，然后按各 store 的删除逻辑原位执行 + markDirty + requestListScroll。 */
import { ref, computed } from 'vue'
import { useTabsStore } from '../../../stores/tabsStore'
import { useUiStore } from '../../../stores/uiStore'
import { useConfirmStore } from '../../../stores/confirmStore'
import { usePresetStore } from '../../../stores/presetStore'
import { useWorldbookStore } from '../../../stores/worldbookStore'
import { useCharacterStore } from '../../../stores/characterStore'
import { isGroupNode } from '../../../composables/useGroupedList'
import type { OrderItem, OrderGroup, OrderNode, FlatNode, PresetBlock, RegexScript } from '../../../types'
import FormField from '../../shared/FormField.vue'

const ROLES = ['system', 'user', 'assistant'] as const

const props = defineProps<{
  workspace?: string
  collection?: string
  scene?: { workspace: string; collection: string }
}>()

const tabsStore = useTabsStore()
const uiStore = useUiStore()
const confirmStore = useConfirmStore()
const presetStore = usePresetStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()

const workspace = computed(() => props.scene?.workspace ?? props.workspace ?? tabsStore.activeWorkspace)
const collection = computed(() => props.scene?.collection ?? props.collection ?? tabsStore.sidebarCollection)

const isNoBatchScene = computed(() => workspace.value === 'character' && collection.value === 'fields')
const isPresetItems = computed(() => workspace.value === 'preset' && collection.value === 'items')
const isWorldbookItems = computed(() => workspace.value === 'worldbook' && collection.value === 'items')
const isRegex = computed(() => collection.value === 'regex')

/** useGroupedList 选中态：组展开为子叶子 identifier。 */
function selectedLeafIds(selectedGi: Set<number>, flatNodes: FlatNode[]): string[] {
  const ids = new Set<string>()
  for (const gi of selectedGi) {
    const node = flatNodes[gi]
    if (!node) continue
    if (node.isGroup) (node.ref as OrderGroup).children.forEach(c => ids.add(c.identifier))
    else ids.add((node.ref as OrderItem).identifier)
  }
  return Array.from(ids)
}

const presetSelectedIds = computed<string[]>(() => selectedLeafIds(presetStore.selectedGi, presetStore.flatNodes))
const worldbookSelectedIds = computed<string[]>(() => selectedLeafIds(worldbookStore.selectedGi, worldbookStore.flatNodes))

/* ====== regex scene 的选中态：读 store.regexSelectedGi（SearchTool.selectSide 同步过来） ======
 *  regex sidebar 已接 useGroupedList，选中态回路跟 preset/worldbook 那套同——SearchTool.selectSide
 *  命中同步进 store.regexSelectedGi，BatchTool 读这份态批改。
 *  不绕本地 gi→identifier 反查（regexSelectedGi 的 gi 在 rebuild regexOrder 后会 stale 指错 node），
 *  直接从 store 拿选中 script 对象引用——store 在反查那一刻 flatNodes 还没 stale，拿到的引用是真对象，
 *  改字段直接生效、删也能 splice 掉真对象。 */
const regexScripts = computed(() => (workspace.value === 'preset' ? presetStore.regexScripts : characterStore.regexScripts))
const regexStore = computed(() => workspace.value === 'character' ? characterStore : presetStore)
/** 选中 script 对象引用集合：组展开为子叶子（跟 selectedLeafIds 同模式，但拿的是对象引用不是 id）。 */
function getSelectedRegexScripts(): RegexScript[] {
  const s = regexStore.value
  const out: RegexScript[] = []
  const scripts = regexScripts.value
  for (const gi of s.regexSelectedGi) {
    const node = s.regexFlatNodes[gi]
    if (!node) continue
    const ids = node.isGroup ? (node.ref as OrderGroup).children.map(c => c.identifier) : [(node.ref as OrderItem).identifier]
    for (const id of ids) {
      const sc = scripts.find(x => x.id === id)
      if (sc) out.push(sc)
    }
  }
  return out
}
const regexSelectedIds = computed<string[]>(() => getSelectedRegexScripts().map(s => s.id))

const selectedCount = computed(() => {
  if (isNoBatchScene.value) return 0
  if (isRegex.value) return regexSelectedIds.value.length
  if (workspace.value === 'preset') return presetSelectedIds.value.length
  return worldbookSelectedIds.value.length
})

function toastApplied(count: number) {
  uiStore.showToast(uiStore.t('toolbox.batch.applied', { count }))
}

/* ====== preset/items ====== */
function walkOrderItems(nodes: OrderNode[], fn: (item: OrderItem) => void) {
  for (const n of nodes) {
    if (isGroupNode(n)) walkOrderItems(n.children, fn)
    else fn(n)
  }
}

function presetSetEnabled(enabled: boolean) {
  const ids = new Set(presetSelectedIds.value)
  if (!ids.size) return
  walkOrderItems(presetStore.order, (item) => { if (ids.has(item.identifier)) item.enabled = enabled })
  presetStore.markDirty()
  toastApplied(ids.size)
}

function presetSetRole(role: string) {
  const ids = new Set(presetSelectedIds.value)
  if (!ids.size) return
  for (const id of ids) {
    const b = presetStore.prompts.find(p => p.identifier === id)
    if (b) b.role = role as PresetBlock['role']
  }
  presetStore.markDirty()
  toastApplied(ids.size)
}

/* ====== regex ====== */
function regexSetDisabled(disabled: boolean) {
  const scripts = getSelectedRegexScripts()
  if (!scripts.length) return
  scripts.forEach(s => { s.disabled = disabled })
  // regex 有双状态（regexScripts 裸数组 + regexOrder 树），浅 watch 永不触发 rebuild——
  // 改完数据显式调 rebuild 让树同步，否则侧边栏开关视觉不变（"改了不生效"）。
  regexStore.value.rebuildRegexOrder()
  if (workspace.value === 'preset') presetStore.markDirty(); else characterStore.markDirty()
  toastApplied(scripts.length)
}

/* ====== worldbook/items ====== */
function wbSelectedEntries() {
  const ids = new Set(worldbookSelectedIds.value)
  return worldbookStore.entries.filter(e => ids.has(String(e.uid)))
}
function wbSetDisabled(disabled: boolean) {
  if (!worldbookSelectedIds.value.length) return
  wbSelectedEntries().forEach(e => { e.disabled = disabled })
  worldbookStore.markDirty()
  toastApplied(worldbookSelectedIds.value.length)
}
/** 三态互斥：keyWord / constant / vectorized，设一个时另两个清零。 */
function wbSetActivation(mode: 'keyWord' | 'constant' | 'vectorized') {
  if (!worldbookSelectedIds.value.length) return
  wbSelectedEntries().forEach(e => {
    e.constant = mode === 'constant'
    e.vectorized = mode === 'vectorized'
    e.keyWord = mode === 'keyWord'
  })
  worldbookStore.markDirty()
  toastApplied(worldbookSelectedIds.value.length)
}

/* ====== 批量删除 ====== */
function removeLeafFromTree(nodes: OrderNode[], identifier: string): boolean {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    if (isGroupNode(n)) {
      if (removeLeafFromTree(n.children, identifier)) return true
    } else if (n.identifier === identifier) {
      nodes.splice(i, 1)
      return true
    }
  }
  return false
}

function deleteSelected() {
  const count = selectedCount.value
  if (!count) return
  confirmStore.ask({
    title: uiStore.t('toolbox.batch.deleteConfirm.title'),
    message: uiStore.t('toolbox.batch.deleteConfirm.message', { count }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: doDelete,
  })
}

function doDelete() {
  if (isRegex.value) {
    const scripts = getSelectedRegexScripts()
    for (const sc of scripts) {
      if (workspace.value === 'preset') presetStore.deleteRegexScript(sc.id)
      else characterStore.deleteRegexScript(sc.id)
      tabsStore.close('regex', sc.id) // 删了的东西对应 tab 也关掉（同 preset 删段行为）
    }
    // regex 双状态：删数据后树里还留着已删 id 的幽灵节点 → 渲染时 getScript 找不到显示 (未命名)。
    // 显式调 rebuild 让树同步删掉幽灵节点。
    regexStore.value.rebuildRegexOrder()
    regexStore.value.regexClearSelection()
    tabsStore.requestListScroll('regex')
    toastApplied(scripts.length)
    return
  }
  if (workspace.value === 'preset') {
    // marker 块受保护（同 presetStore.deleteBlock），批量删除跳过
    const ids = presetSelectedIds.value.filter(id => !presetStore.prompts.find(p => p.identifier === id)?.marker)
    const removed: string[] = []
    for (const id of ids) {
      if (removeLeafFromTree(presetStore.order, id)) {
        removed.push(id)
        tabsStore.close('preset', id)
        const pi = presetStore.prompts.findIndex(p => p.identifier === id)
        if (pi >= 0) presetStore.prompts.splice(pi, 1)
      }
    }
    if (removed.length) { presetStore.markDirty(); presetStore.rebuildVarIndex() }
    presetStore.selectedGi = new Set()
    presetStore.anchorGi = -1
    tabsStore.requestListScroll('preset')
    toastApplied(removed.length)
    return
  }
  const ids = worldbookSelectedIds.value
  const removed: string[] = []
  for (const id of ids) {
    if (removeLeafFromTree(worldbookStore.order, id)) {
      removed.push(id)
      tabsStore.close('worldbook', id)
      const ei = worldbookStore.entries.findIndex(e => String(e.uid) === id)
      if (ei >= 0) worldbookStore.entries.splice(ei, 1)
    }
  }
  if (removed.length) worldbookStore.markDirty()
  worldbookStore.selectedGi = new Set()
  worldbookStore.anchorGi = -1
  tabsStore.requestListScroll('worldbook')
  toastApplied(removed.length)
}
</script>


