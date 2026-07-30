<template>
  <FloatingPanelShell
    v-if="store.copyPanelOpen"
    :title="uiStore.t('preset.copyPanel.title')"
    :close-title="uiStore.t('common.close')"
    :width="1040"
    :height="620"
    :min-width="560"
    :min-height="360"
    @close="close"
  >
    <div class="pr-cp-body">
      <div class="pr-cp-col">
        <div class="pr-cp-col-head">
          <select class="pr-cp-sel" v-model="sides.left.name">
            <option value="" disabled>{{ uiStore.t('preset.copyPanel.selectPreset') }}</option>
            <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <button class="wb-btn" :disabled="!sides.left.name" @click="loadSide('left')">{{ uiStore.t('common.load') }}</button>
        </div>
        <template v-if="sides.left.data">
          <div class="pr-cp-toolbar">
            <button class="wb-btn" @click="selectAll('left')">{{ uiStore.t('preset.copyPanel.selectAll') }}</button>
            <button class="wb-btn" @click="clearSel('left')">{{ uiStore.t('preset.copyPanel.clearAll') }}</button>
            <span class="pr-search-count">{{ sides.left.sel.size }}/{{ sides.left.data.prompts.length }}</span>
            <span class="wb-spacer"></span>
            <button class="wb-btn accent" :disabled="!sides.left.dirty" @click="saveSide('left')">{{ uiStore.t('common.save') }}{{ sides.left.dirty ? ' *' : '' }}</button>
          </div>
          <div class="pr-cp-list">
            <p v-if="!leftOrdered.length" class="pr-cp-empty">{{ uiStore.t('preset.copyPanel.noBlocks') }}</p>
            <div v-for="e in leftOrdered" :key="e.block.identifier" class="pr-cp-item pr-block-item" :class="{ selected: sides.left.sel.has(e.block.identifier) }" @click="onItemClick('left', e.block.identifier, $event)">
              <span class="pr-block-role" :class="roleClass(e.block.role)">{{ e.block.role }}</span>
              <span class="pr-block-name">{{ e.block.name || e.block.identifier }}</span>
              <span v-if="e.hidden" class="pr-hidden-badge" :title="uiStore.t('preset.sidebar.hiddenTitle')">{{ uiStore.t('common.hidden') }}</span>
              <span class="pr-block-act del" :title="uiStore.t('preset.copyPanel.removeBlock')" @click.stop="removeBlock('left', e.block.identifier)">🗑</span>
            </div>
          </div>
        </template>
        <p v-else class="pr-cp-empty">{{ uiStore.t('preset.copyPanel.pickPreset') }}</p>
      </div>

      <div class="pr-cp-mid">
        <button class="wb-btn accent" :disabled="!sides.left.sel.size || !sides.right.data" :title="uiStore.t('preset.copyPanel.copyRight')" @click="copy('left')">{{ isMobile ? '▼' : '▶' }}</button>
        <button class="wb-btn accent" :disabled="!sides.right.sel.size || !sides.left.data" :title="uiStore.t('preset.copyPanel.copyLeft')" @click="copy('right')">{{ isMobile ? '▲' : '◀' }}</button>
      </div>

      <div class="pr-cp-col">
        <div class="pr-cp-col-head">
          <select class="pr-cp-sel" v-model="sides.right.name">
            <option value="" disabled>{{ uiStore.t('preset.copyPanel.selectPreset') }}</option>
            <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <button class="wb-btn" :disabled="!sides.right.name" @click="loadSide('right')">{{ uiStore.t('common.load') }}</button>
        </div>
        <template v-if="sides.right.data">
          <div class="pr-cp-toolbar">
            <button class="wb-btn" @click="selectAll('right')">{{ uiStore.t('preset.copyPanel.selectAll') }}</button>
            <button class="wb-btn" @click="clearSel('right')">{{ uiStore.t('preset.copyPanel.clearAll') }}</button>
            <span class="pr-search-count">{{ sides.right.sel.size }}/{{ sides.right.data.prompts.length }}</span>
            <span class="wb-spacer"></span>
            <button class="wb-btn accent" :disabled="!sides.right.dirty" @click="saveSide('right')">{{ uiStore.t('common.save') }}{{ sides.right.dirty ? ' *' : '' }}</button>
          </div>
          <div class="pr-cp-list">
            <p v-if="!rightOrdered.length" class="pr-cp-empty">{{ uiStore.t('preset.copyPanel.noBlocks') }}</p>
            <div v-for="e in rightOrdered" :key="e.block.identifier" class="pr-cp-item pr-block-item" :class="{ selected: sides.right.sel.has(e.block.identifier) }" @click="onItemClick('right', e.block.identifier, $event)">
              <span class="pr-block-role" :class="roleClass(e.block.role)">{{ e.block.role }}</span>
              <span class="pr-block-name">{{ e.block.name || e.block.identifier }}</span>
              <span v-if="e.hidden" class="pr-hidden-badge" :title="uiStore.t('preset.sidebar.hiddenTitle')">{{ uiStore.t('common.hidden') }}</span>
              <span class="pr-block-act del" :title="uiStore.t('preset.copyPanel.removeBlock')" @click.stop="removeBlock('right', e.block.identifier)">🗑</span>
            </div>
          </div>
        </template>
        <p v-else class="pr-cp-empty">{{ uiStore.t('preset.copyPanel.pickPreset') }}</p>
      </div>
    </div>
  </FloatingPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useIsMobile } from '../../composables/hostEnv'
import FloatingPanelShell from '../shared/FloatingPanelShell.vue'
import * as ST from '../../api/presetApi'
import type { PresetListEntry } from '../../api/presetApi'
import type { PresetData, PresetBlock, OrderItem } from '../../types'
import { applyMultiSelect, roleClass, esc, orderedPromptsWithHidden } from '../../utils'

const store = usePresetStore()
const uiStore = useUiStore()
const confirmStore = useConfirmStore()
const isMobile = useIsMobile()

const presetOptions = ref<PresetListEntry[]>([])

type Side = 'left' | 'right'
interface SideState {
  name: string
  data: PresetData | null
  sel: Set<string>
  anchor: string | null
  dirty: boolean
}
/** 每侧状态（name/data/选中集合/锚点/脏标记），用 reactive 按 side 索引统一访问。 */
const sides = reactive<Record<Side, SideState>>({
  left: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
  right: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
})
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/** 块按实际生成顺序（prompt_order）排列，隐藏块（不在 order 内）追加到末尾并打标记。 */
const leftOrdered = computed(() => sides.left.data ? orderedPromptsWithHidden(sides.left.data) : [])
const rightOrdered = computed(() => sides.right.data ? orderedPromptsWithHidden(sides.right.data) : [])

/** 面板每次打开都重新列出可用预设，不依赖主编辑器的 store.presetList（可能过期或未加载）。 */
watch(() => store.copyPanelOpen, (open) => {
  if (!open) return
  try { presetOptions.value = ST.listPresets() }
  catch (e: any) { uiStore.showToast(uiStore.t('preset.toast.listFailedCopyPanel', { msg: e?.message || e })) }
})

function genId() {
  return 'copy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 载入指定侧预设。若该侧有未保存改动，先确认。 */
function loadSide(side: Side) {
  const s = sides[side]
  if (!s.name) return
  const doLoad = () => {
    try {
      const data = ST.getPresetByName(s.name)
      if (!data) { uiStore.showToast(uiStore.t('preset.toast.notFound', { name: s.name })); return }
      s.data = data; s.sel = new Set(); s.anchor = null; s.dirty = false
    } catch (e: any) { uiStore.showToast(uiStore.t('preset.toast.loadFailedCopyPanel', { msg: e?.message || e })) }
  }
  if (!s.dirty) { doLoad(); return }
  confirmStore.ask({
    title: uiStore.t('preset.confirm.reload.title'),
    message: uiStore.t('preset.confirm.reload.message', { name: esc(s.name) }),
    confirmText: uiStore.t('preset.confirm.reload.confirm'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: doLoad,
  })
}

/**
 * 列表项点击：与主编辑器侧边栏同款 ctrl/shift/普通点击多选模型（applyMultiSelect）。
 * `all` 必须按视觉顺序（leftOrdered/rightOrdered）传入，否则 shift 区间选择会选错行。
 */
function onItemClick(side: Side, id: string, e: MouseEvent) {
  const s = sides[side]
  if (!s.data) return
  const ordered = side === 'left' ? leftOrdered.value : rightOrdered.value
  const all = ordered.map(x => x.block.identifier)
  const next = applyMultiSelect(
    { selected: s.sel, anchor: s.anchor },
    id, all,
    { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
  )
  s.sel = next.selected; s.anchor = next.anchor
}
function selectAll(side: Side) {
  const s = sides[side]
  if (!s.data) return
  s.sel = new Set(s.data.prompts.map(b => b.identifier))
  s.anchor = null
}
function clearSel(side: Side) {
  sides[side].sel = new Set()
  sides[side].anchor = null
}

/** 确保 data.prompt_order 中存在 character_id === 100001 的条目及其 order 数组，返回该 order。 */
function ensureOrder(data: PresetData): OrderItem[] {
  if (!Array.isArray(data.prompt_order)) data.prompt_order = []
  let entry = data.prompt_order.find((p: any) => p.character_id === 100001)
  if (!entry) {
    entry = { character_id: 100001, order: [] }
    data.prompt_order.push(entry)
  }
  if (!Array.isArray(entry.order)) entry.order = []
  return entry.order
}

/**
 * 从 from 侧复制选中块到另一侧。按源侧视觉顺序遍历，保证粘贴后顺序与所选一致；
 * 目标侧每个块都重新生成 identifier，避免与已有 id（或之前粘贴的同块副本）冲突。
 */
function copy(from: Side) {
  const src = sides[from]
  const dst = sides[other(from)]
  if (!src.data || !dst.data) { uiStore.showToast(uiStore.t('preset.copyPanel.loadBothFirst')); return }
  if (!src.sel.size) { uiStore.showToast(uiStore.t('preset.copyPanel.selectBlocksFirst')); return }

  const dstOrder = ensureOrder(dst.data)
  const existingIds = new Set(dst.data.prompts.map(p => p.identifier))
  let n = 0
  const srcOrdered = from === 'left' ? leftOrdered.value : rightOrdered.value
  for (const entry of srcOrdered) {
    const b = entry.block
    if (!src.sel.has(b.identifier)) continue
    const clone: PresetBlock = JSON.parse(JSON.stringify(b))
    let newId = genId()
    while (existingIds.has(newId)) newId = genId()
    clone.identifier = newId
    existingIds.add(newId)
    dst.data.prompts.push(clone)
    dstOrder.push({ identifier: newId, enabled: true })
    n++
  }
  dst.dirty = true
  uiStore.showToast(uiStore.t('preset.toast.copiedBlocks', { n, dir: uiStore.t(from === 'left' ? 'preset.copyPanel.dirRight' : 'preset.copyPanel.dirLeft') }))
}

function removeBlock(side: Side, id: string) {
  const s = sides[side]
  if (!s.data) return
  const block = s.data.prompts.find(p => p.identifier === id)
  confirmStore.ask({
    title: uiStore.t('preset.confirm.removeBlock.title'),
    message: uiStore.t('preset.confirm.removeBlock.message', { name: esc(block?.name || id) }),
    confirmText: uiStore.t('preset.confirm.removeBlock.confirm'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => {
      const data = s.data!
      const pi = data.prompts.findIndex(p => p.identifier === id)
      if (pi >= 0) data.prompts.splice(pi, 1)
      const order = ensureOrder(data)
      for (let i = order.length - 1; i >= 0; i--) if (order[i].identifier === id) order.splice(i, 1)
      if (s.sel.has(id)) { const next = new Set(s.sel); next.delete(id); s.sel = next }
      if (s.anchor === id) s.anchor = null
      s.dirty = true
    },
  })
}

/** 保存一侧：传 ST 纯深拷贝（Vue Proxy 不能被 structuredClone 处理）；若保存的恰好是主编辑器当前预设，提示重载。 */
async function saveSide(side: Side) {
  const s = sides[side]
  if (!s.data || !s.name) return
  try {
    await ST.savePresetAs(s.name, JSON.parse(JSON.stringify(s.data)))
    s.dirty = false
    store.refreshPresetList()
    uiStore.showToast(uiStore.t('preset.toast.saved', { name: s.name }))
    if (s.name === store.presetName) uiStore.showToast(uiStore.t('preset.toast.reloadNote'))
  } catch (e: any) { uiStore.showToast(uiStore.t('preset.toast.saveFailed', { msg: e?.message || e })) }
}

/** 关闭面板：两侧都干净才直接关；否则弹确认。 */
function close() {
  if (!sides.left.dirty && !sides.right.dirty) { store.copyPanelOpen = false; return }
  confirmStore.ask({
    title: uiStore.t('preset.confirm.closeUnsaved.title'),
    message: uiStore.t('preset.confirm.closeUnsaved.message'),
    confirmText: uiStore.t('common.close'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => { store.copyPanelOpen = false },
  })
}
</script>
