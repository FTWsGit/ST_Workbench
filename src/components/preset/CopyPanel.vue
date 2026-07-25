<template>
  <div v-if="store.copyPanelOpen" class="wb-modal-overlay" @click.self="close">
    <div class="wb-modal pr-cp-modal">
      <h3>{{ store.t('preset.copyPanel.title') }}</h3>
      <div class="pr-cp-body">
        <div class="pr-cp-col">
          <div class="pr-cp-col-head">
            <select class="pr-cp-sel" v-model="sides.left.name">
              <option value="" disabled>{{ store.t('preset.copyPanel.selectPreset') }}</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="wb-btn" :disabled="!sides.left.name" @click="loadSide('left')">{{ store.t('common.load') }}</button>
          </div>
          <template v-if="sides.left.data">
            <div class="pr-cp-toolbar">
              <button class="wb-btn" @click="selectAll('left')">{{ store.t('preset.copyPanel.selectAll') }}</button>
              <button class="wb-btn" @click="clearSel('left')">{{ store.t('preset.copyPanel.clearAll') }}</button>
              <span class="pr-search-count">{{ sides.left.sel.size }}/{{ sides.left.data.prompts.length }}</span>
              <span class="wb-spacer"></span>
              <button class="wb-btn accent" :disabled="!sides.left.dirty" @click="saveSide('left')">{{ store.t('common.save') }}{{ sides.left.dirty ? ' *' : '' }}</button>
            </div>
            <div class="pr-cp-list">
              <p v-if="!leftOrdered.length" class="pr-cp-empty">{{ store.t('preset.copyPanel.noBlocks') }}</p>
              <div v-for="e in leftOrdered" :key="e.block.identifier" class="pr-cp-item pr-block-item" :class="{ selected: sides.left.sel.has(e.block.identifier) }" @click="onItemClick('left', e.block.identifier, $event)">
                <span class="pr-block-role" :class="roleClass(e.block.role)">{{ e.block.role }}</span>
                <span class="pr-block-name">{{ e.block.name || e.block.identifier }}</span>
                <span v-if="e.hidden" class="pr-hidden-badge" :title="store.t('preset.sidebar.hiddenTitle')">{{ store.t('common.hidden') }}</span>
                <span class="pr-block-act del" :title="store.t('preset.copyPanel.removeBlock')" @click.stop="removeBlock('left', e.block.identifier)">🗑</span>
              </div>
            </div>
          </template>
          <p v-else class="pr-cp-empty">{{ store.t('preset.copyPanel.pickPreset') }}</p>
        </div>

        <div class="pr-cp-mid">
          <button class="wb-btn accent" :disabled="!sides.left.sel.size || !sides.right.data" :title="store.t('preset.copyPanel.copyRight')" @click="copy('left')">{{ isMobile ? '▼' : '▶' }}</button>
          <button class="wb-btn accent" :disabled="!sides.right.sel.size || !sides.left.data" :title="store.t('preset.copyPanel.copyLeft')" @click="copy('right')">{{ isMobile ? '▲' : '◀' }}</button>
        </div>

        <div class="pr-cp-col">
          <div class="pr-cp-col-head">
            <select class="pr-cp-sel" v-model="sides.right.name">
              <option value="" disabled>{{ store.t('preset.copyPanel.selectPreset') }}</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="wb-btn" :disabled="!sides.right.name" @click="loadSide('right')">{{ store.t('common.load') }}</button>
          </div>
          <template v-if="sides.right.data">
            <div class="pr-cp-toolbar">
              <button class="wb-btn" @click="selectAll('right')">{{ store.t('preset.copyPanel.selectAll') }}</button>
              <button class="wb-btn" @click="clearSel('right')">{{ store.t('preset.copyPanel.clearAll') }}</button>
              <span class="pr-search-count">{{ sides.right.sel.size }}/{{ sides.right.data.prompts.length }}</span>
              <span class="wb-spacer"></span>
              <button class="wb-btn accent" :disabled="!sides.right.dirty" @click="saveSide('right')">{{ store.t('common.save') }}{{ sides.right.dirty ? ' *' : '' }}</button>
            </div>
            <div class="pr-cp-list">
              <p v-if="!rightOrdered.length" class="pr-cp-empty">{{ store.t('preset.copyPanel.noBlocks') }}</p>
              <div v-for="e in rightOrdered" :key="e.block.identifier" class="pr-cp-item pr-block-item" :class="{ selected: sides.right.sel.has(e.block.identifier) }" @click="onItemClick('right', e.block.identifier, $event)">
                <span class="pr-block-role" :class="roleClass(e.block.role)">{{ e.block.role }}</span>
                <span class="pr-block-name">{{ e.block.name || e.block.identifier }}</span>
                <span v-if="e.hidden" class="pr-hidden-badge" :title="store.t('preset.sidebar.hiddenTitle')">{{ store.t('common.hidden') }}</span>
                <span class="pr-block-act del" :title="store.t('preset.copyPanel.removeBlock')" @click.stop="removeBlock('right', e.block.identifier)">🗑</span>
              </div>
            </div>
          </template>
          <p v-else class="pr-cp-empty">{{ store.t('preset.copyPanel.pickPreset') }}</p>
        </div>
      </div>
      <div class="wb-modal-footer">
        <button class="wb-btn" @click="close">{{ store.t('preset.copyPanel.close') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useConfirmStore } from '../../stores/confirmStore'
import { useIsMobile } from '../../composables/hostEnv'
import * as ST from '../../api/presetApi'
import type { PresetListEntry } from '../../api/presetApi'
import type { PresetData, PresetBlock, OrderItem } from '../../types'
import { applyMultiSelect, roleClass, esc, orderedPromptsWithHidden } from '../../utils'

const store = usePresetStore()
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
// Was five separate ref() pairs (leftName/rightName, leftData/rightData, ...) with every function
// below doing `side === 'left' ? leftX.value : rightX.value` to pick one. A reactive per-side
// object collapses that into `sides[side].x` everywhere and gives a natural home for the third
// column if this panel ever needs one (e.g. copying into a brand-new preset).
const sides = reactive<Record<Side, SideState>>({
  left: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
  right: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
})
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')

// Blocks in their actual generation order (prompt_order), not raw prompts[] storage order — see
// utils.ts's orderedPromptsWithHidden() doc comment. Hidden (not-in-order) blocks are appended
// at the end and flagged so the UI can mark them.
const leftOrdered = computed(() => sides.left.data ? orderedPromptsWithHidden(sides.left.data) : [])
const rightOrdered = computed(() => sides.right.data ? orderedPromptsWithHidden(sides.right.data) : [])

// Re-list available presets fresh every time the panel opens — deliberately independent of the
// main editor's store.presetList (which may be stale, or never populated if the main panel's
// list wasn't opened this session).
watch(() => store.copyPanelOpen, (open) => {
  if (!open) return
  try { presetOptions.value = ST.listPresets() }
  catch (e: any) { store.showToast(store.t('shared.toast.listPresetsCopyPanel', { msg: e?.message || e })) }
})

function genId() {
  return 'copy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadSide(side: Side) {
  const s = sides[side]
  if (!s.name) return
  const doLoad = () => {
    try {
      const data = ST.getPresetByName(s.name)
      if (!data) { store.showToast(store.t('shared.toast.presetNotFound', { name: s.name })); return }
      s.data = data; s.sel = new Set(); s.anchor = null; s.dirty = false
    } catch (e: any) { store.showToast(store.t('shared.toast.loadFailedCopyPanel', { msg: e?.message || e })) }
  }
  if (!s.dirty) { doLoad(); return }
  confirmStore.ask({
    title: store.t('shared.confirm.reloadPreset.title'),
    message: store.t('shared.confirm.reloadPreset.message', { name: esc(s.name) }),
    confirmText: store.t('shared.confirm.reloadPreset.confirm'),
    cancelText: store.t('common.cancel'),
    onConfirm: doLoad,
  })
}

// Same ctrl/shift/plain click model as the main editor's sidebar (PresetSidebar.vue → store's
// selectBlock) — see applyMultiSelect's doc comment in utils.ts for the exact semantics.
// `all` must be in the same VISUAL order the list renders in (leftOrdered/rightOrdered), not raw
// prompts[] storage order — otherwise shift-range-select would pick the wrong span of rows even
// after the display order itself was fixed.
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

/** prompt_order in a raw PresetData is always a flat array (groups are just `_gid`-tagged
 *  entries within it, see presetStore.ts's importOrderWithGroups/exportOrder) — no tree to build
 *  here. */
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

function copy(from: Side) {
  const src = sides[from]
  const dst = sides[other(from)]
  if (!src.data || !dst.data) { store.showToast(store.t('preset.copyPanel.loadBothFirst')); return }
  if (!src.sel.size) { store.showToast(store.t('preset.copyPanel.selectBlocksFirst')); return }

  const dstOrder = ensureOrder(dst.data)
  const existingIds = new Set(dst.data.prompts.map(p => p.identifier))
  let n = 0
  // Walk the SOURCE's visual (ordered) sequence, not prompts[] storage order, so a multi-select
  // copy lands on the destination side in the order you saw/selected it in, not whatever order
  // ST happened to store the source blocks in internally.
  const srcOrdered = from === 'left' ? leftOrdered.value : rightOrdered.value
  for (const entry of srcOrdered) {
    const b = entry.block
    if (!src.sel.has(b.identifier)) continue
    const clone: PresetBlock = JSON.parse(JSON.stringify(b))
    // Always mint a fresh identifier on the destination side — reusing the source's own id
    // risks colliding with an unrelated block that already happens to use it over there (or
    // with an earlier copy of this same block pasted in previously), which would silently
    // overwrite/duplicate the wrong block instead of adding a new one.
    let newId = genId()
    while (existingIds.has(newId)) newId = genId()
    clone.identifier = newId
    existingIds.add(newId)
    dst.data.prompts.push(clone)
    dstOrder.push({ identifier: newId, enabled: true })
    n++
  }
  dst.dirty = true
  store.showToast(store.t('shared.toast.copiedBlocks', { n, dir: store.t(from === 'left' ? 'preset.copyPanel.dirRight' : 'preset.copyPanel.dirLeft') }))
}

function removeBlock(side: Side, id: string) {
  const s = sides[side]
  if (!s.data) return
  const block = s.data.prompts.find(p => p.identifier === id)
  confirmStore.ask({
    title: store.t('shared.confirm.removeBlock.title'),
    message: store.t('shared.confirm.removeBlock.message', { name: esc(block?.name || id) }),
    confirmText: store.t('shared.confirm.removeBlock.confirm'),
    cancelText: store.t('common.cancel'),
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

async function saveSide(side: Side) {
  const s = sides[side]
  if (!s.data || !s.name) return
  try {
    // Same rule as presetStore.ts's doSavePreset(): never hand ST a live reactive object,
    // always a plain deep clone (structuredClone inside ST's savePreset can't clone a Vue Proxy).
    await ST.savePresetAs(s.name, JSON.parse(JSON.stringify(s.data)))
    s.dirty = false
    store.refreshPresetList()
    store.showToast(store.t('shared.toast.saved', { name: s.name }))
    // This tool operates on its own independently-loaded copy of the preset data, not on the
    // main editor's live store — if this happens to be the same preset currently open there,
    // that in-memory copy is now stale relative to what was just written to disk.
    if (s.name === store.presetName) store.showToast(store.t('shared.toast.presetReloadNote'))
  } catch (e: any) { store.showToast(store.t('shared.toast.saveFailed', { msg: e?.message || e })) }
}

function close() {
  if (!sides.left.dirty && !sides.right.dirty) { store.copyPanelOpen = false; return }
  confirmStore.ask({
    title: store.t('shared.confirm.closeUnsaved.title'),
    message: store.t('shared.confirm.closeUnsaved.message'),
    confirmText: store.t('shared.confirm.closeUnsaved.confirm'),
    cancelText: store.t('common.cancel'),
    onConfirm: () => { store.copyPanelOpen = false },
  })
}
</script>
