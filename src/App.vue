<template>
  <div class="st-wb" :style="store.cssVars">
    <Transition name="wb-fab">
      <button v-if="!store.panelOpen" class="wb-fab" :class="{ dragging: fabDragging }"
              :style="fabStyle" @pointerdown="onFabPointerDown" @click="onFabClick">W</button>
    </Transition>

    <Transition name="wb-panel">
      <div v-if="store.panelOpen" class="wb-panel">
        <div class="wb-header">
          <!-- Desktop: full button row, unchanged. Mobile: a compact row (☰ / Save / preset /
               ⋯ / ✕) — the rest of these buttons move into the ⋯ tools sheet below (see
               .wb-mobile-tools-sheet), since 8+ buttons don't fit a ~360px header no matter how
               much padding gets trimmed. -->
          <template v-if="!isMobile">
            <button class="wb-btn accent" @click="onSave()">{{ store.t('shared.header.save', { star: store.dirty ? ' *' : '' }) }}</button>
            <div class="wb-sep"></div>
            <button class="wb-btn" @click="store.reloadPreset()">{{ store.t('shared.header.reload') }}</button>
            <button class="wb-btn" @click="store.settingsOpen = true">{{ store.t('shared.header.settings') }}</button>
            <div class="wb-sep"></div>
            <div class="wb-mode-switch">
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'preset' }" @click="tabsStore.setSidebarMode('preset')">{{ store.t('shared.header.mode.preset') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="tabsStore.setSidebarMode('regex')">{{ store.t('shared.header.mode.regex') }}</button>
            </div>
            <div class="wb-sep"></div>
            <button class="wb-btn" @click="store.copyPanelOpen = true">{{ store.t('shared.header.copyBlocks') }}</button>
            <button class="wb-btn" :class="{ active: store.searchOpen }" @click="toggleSearch">{{ store.t('shared.header.search') }}</button>
            <div class="wb-spacer"></div>
            <button class="wb-btn" :class="{ active: store.varNavOpen }" @click="store.varNavOpen = !store.varNavOpen">{{ store.t('shared.header.varNav') }}</button>
            <button class="wb-btn" :class="{ active: store.previewOpen }" @click="store.previewOpen = !store.previewOpen">{{ store.t('shared.header.preview') }}</button>
            <button class="wb-btn icon-btn" :title="store.t('shared.header.newPreset')" @click="onNewPreset">+</button>
            <button class="wb-btn icon-btn" :title="store.t('shared.header.deletePreset')" @click="onDeletePreset" :disabled="!store.presetName">🗑</button>
            <select v-if="store.presetList.length" class="pr-preset-select" :value="store.presetName" @change="onPresetSelect($event)" :title="store.t('shared.header.switchPreset')">
              <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || store.t('shared.header.noneLoaded') }}</option>
              <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <span v-else-if="store.presetName" class="pr-preset-name">{{ store.presetName }}</span>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
          <template v-else>
            <button class="wb-mobile-hamburger" :title="store.t('shared.mobile.sidebar')" @click="toggleMobileSidebar">☰</button>
            <button class="wb-btn accent" @click="onSave()">{{ store.t('shared.header.save', { star: store.dirty ? ' *' : '' }) }}</button>
            <button class="wb-btn" @click="store.reloadPreset()">{{ store.t('shared.header.reload') }}</button>
            <select v-if="store.presetList.length" class="pr-preset-select" :value="store.presetName" @change="onPresetSelect($event)" :title="store.t('shared.header.switchPreset')">
              <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || store.t('shared.header.noneLoaded') }}</option>
              <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <span v-else-if="store.presetName" class="pr-preset-name">{{ store.presetName }}</span>
            <div class="wb-spacer"></div>
            <button class="wb-mobile-tools-btn" :class="{ active: mobileDrawerVisible === 'tools' }" :title="store.t('shared.mobile.tools')" @click="toggleMobileTools">⋯</button>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
        </div>

        <SearchPanel v-if="store.searchOpen" /> 

        <div class="wb-main">
          <PresetSidebar v-if="tabsStore.sidebarMode === 'preset'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <RegexSidebar v-else-if="tabsStore.sidebarMode === 'regex'"
            :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'"
            :scripts="store.regexScripts" workspace="preset" :t="store.t"
            :on-add="store.addRegexScript" :on-delete="store.deleteRegexScript" :on-reorder="store.reorderRegexScript"
            :sidebar-width="store.settings.sidebarWidth"
            :on-sidebar-width-change="setRegexSidebarWidth"
            :on-sidebar-width-commit="store.saveSettings" />
          <div class="wb-editor-col">
            <TabBar />
            <div class="wb-editor-row">
              <EditorShell />
              <SettingsDock :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'settingsDock' }" />
            </div>
          </div>
          <VarPanel v-if="store.varNavOpen" :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'varNav' }" />
          <PreviewPanel v-if="store.previewOpen" :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'preview' }" />
        </div>

        <!-- Mobile-only: dims the editor behind whichever drawer/sheet is open, tap to close.
             Never rendered on desktop (v-if="isMobile"), where nothing here ever opens as an
             overlay in the first place. -->
        <div v-if="isMobile && mobileDrawerVisible !== 'none'" class="wb-mobile-backdrop" @click="closeMobileDrawer"></div>

        <!-- Mobile-only action sheet for everything that didn't fit the compact header row. -->
        <div v-if="isMobile" class="wb-mobile-tools-sheet" :class="{ 'wb-mobile-drawer-open': mobileDrawerVisible === 'tools' }">
          <div class="wb-mobile-tools-grip"></div>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'preset' }" @click="runTool(() => tabsStore.setSidebarMode('preset'))">{{ store.t('shared.header.mode.preset') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="runTool(() => tabsStore.setSidebarMode('regex'))">{{ store.t('shared.header.mode.regex') }}</button>
          <button class="wb-mobile-tools-item" @click="runTool(() => { store.copyPanelOpen = true })">{{ store.t('shared.header.copyBlocks') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: store.searchOpen }" @click="runTool(toggleSearch)">{{ store.t('shared.header.search') }}</button>
          <button class="wb-mobile-tools-item" @click="runTool(() => { store.settingsOpen = true })">{{ store.t('shared.header.settings') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: store.varNavOpen }" @click="runTool(() => { store.varNavOpen = !store.varNavOpen })">{{ store.t('shared.header.varNav') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: store.previewOpen }" @click="runTool(() => { store.previewOpen = !store.previewOpen })">{{ store.t('shared.header.preview') }}</button>
          <button class="wb-mobile-tools-item" @click="runTool(onNewPreset)">{{ store.t('shared.header.newPreset') }}</button>
          <button class="wb-mobile-tools-item" :disabled="!store.presetName" @click="runTool(onDeletePreset)">{{ store.t('shared.header.deletePreset') }}</button>
        </div>

        <!-- CopyPanel is now a real floating window (FloatingPanelShell, z-index 100010+, see
             useFloatingPanel.ts), not a .wb-modal-overlay — DOM order between it and Modals no
             longer matters for stacking. Modals' own overlay (settings/confirm/prompt/hidden-list)
             sits at z-index 300000, always above any floating panel regardless of source order,
             so confirm/prompt dialogs triggered from CopyPanel's own close()/loadSide()/removeBlock()
             remain reachable instead of getting trapped behind it. -->
        <CopyPanel />
        <Modals />
      </div>
    </Transition>
    <VarPopup />
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from './stores/presetStore'
import SearchPanel from './components/preset/SearchPanel.vue'
import PresetSidebar from './components/preset/PresetSidebar.vue'
import VarPanel from './components/preset/VarPanel.vue'
import PreviewPanel from './components/preset/PreviewPanel.vue'
import VarPopup from './components/preset/VarPopup.vue'
import CopyPanel from './components/preset/CopyPanel.vue'
import RegexSidebar from './components/regex/RegexSidebar.vue'
import Modals from './components/shared/Modals.vue'
import TabBar from './components/shared/TabBar.vue'
import EditorShell from './components/shared/EditorShell.vue'
import SettingsDock from './components/shared/SettingsDock.vue'
import { useTabsStore } from './stores/tabsStore'
import { useConfirmStore } from './stores/confirmStore'
import { esc } from './utils'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useIsMobile, getHostWindow } from './composables/hostEnv'

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const store = usePresetStore()

// Mobile layout: sidebar/varNav/preview/settingsDock render as off-canvas overlays (left drawer
// for sidebar, bottom sheets for the other three — see main.css's @media (max-width) preset)
// instead of docked flex columns. At most one is visibly slid into view at a time, tracked here;
// 'tools' is the ⋯ action sheet itself, not a panel. The underlying store flags
// (varNavOpen/previewOpen/settingsDockOpen) keep meaning exactly what they already mean on
// desktop — mobileDrawerVisible is purely "which one, if any, is the one currently slid into
// view", kept in sync with those flags by the watchers below rather than being a second source
// of truth for whether a panel is open at all.
const isMobile = useIsMobile()
const mobileDrawerVisible = ref<'none' | 'sidebar' | 'varNav' | 'preview' | 'settingsDock' | 'tools'>('none')

function toggleMobileSidebar() {
  mobileDrawerVisible.value = mobileDrawerVisible.value === 'sidebar' ? 'none' : 'sidebar'
}
function toggleMobileTools() {
  mobileDrawerVisible.value = mobileDrawerVisible.value === 'tools' ? 'none' : 'tools'
}
// Backdrop tap (or anything else that wants to dismiss whatever's open): for varNav/preview/
// settingsDock, actually flip the underlying store flag off (closing = closing, same as tapping
// its own header/tools-sheet button again) rather than just hiding it visually — otherwise the
// panel would stay "open" in the data sense while invisible, which would be surprising if the
// viewport later grows past the mobile breakpoint. Sidebar and the tools sheet have no
// underlying flag (they're always-mounted/ephemeral respectively), so those just reset the
// local state.
function closeMobileDrawer() {
  if (mobileDrawerVisible.value === 'varNav') store.varNavOpen = false
  else if (mobileDrawerVisible.value === 'preview') store.previewOpen = false
  else if (mobileDrawerVisible.value === 'settingsDock') tabsStore.settingsDockOpen = false
  mobileDrawerVisible.value = 'none'
}
// Every tools-sheet item runs its action then closes the sheet. If the action itself opens one
// of the tracked panels (e.g. toggling varNavOpen on), the watchers below reliably re-open the
// matching drawer state right after — Vue's default watcher flush runs after this synchronous
// handler finishes, so "close the sheet" here and "open the new drawer" there don't race.
function runTool(fn: () => void) {
  fn()
  mobileDrawerVisible.value = 'none'
}

watch(() => store.varNavOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'varNav'
  else if (mobileDrawerVisible.value === 'varNav') mobileDrawerVisible.value = 'none'
})
watch(() => store.previewOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'preview'
  else if (mobileDrawerVisible.value === 'preview') mobileDrawerVisible.value = 'none'
})
watch(() => tabsStore.settingsDockOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'settingsDock'
  else if (mobileDrawerVisible.value === 'settingsDock') mobileDrawerVisible.value = 'none'
})
// Switching preset/regex mode (from the tools sheet on mobile) brings the sidebar into view,
// since that's the part that just changed and is presumably what the user wants to look at.
watch(() => tabsStore.sidebarMode, () => { if (isMobile.value) mobileDrawerVisible.value = 'sidebar' })
// Whenever the active tab changes — most commonly the user picked something in the sidebar
// drawer — the editor underneath is what they actually want to see next, so close WHATEVER
// overlay is currently open, not just the sidebar specifically.
watch(() => tabsStore.activeId, () => {
  if (isMobile.value) mobileDrawerVisible.value = 'none'
})
// Search/var-nav "jump to" actions (jumpToSearchResult/jumpToVarOp/jumpToPopupVar in
// presetStore.ts) call requestEditorJump, which bumps store.editorJump's token on every single
// call — including when the jump target is inside the tab that's ALREADY active, where
// tabsStore.activeId wouldn't change at all and the watcher above would never fire. Without this
// second watcher, jumping to a different variable/match inside the preset you're already editing
// left the var-nav/preview sheet sitting on top of the editor with nothing visibly happening —
// exactly the "click does nothing" symptom, just for the one case activeId alone can't catch.
watch(() => store.editorJump, () => {
  if (isMobile.value) mobileDrawerVisible.value = 'none'
})

// FAB long-press-to-move. Mirrors the long-press pattern in PresetSidebar.vue's
// onItemMouseDown (same LONG_PRESS_MS/DRAG_THRESHOLD) and the "draft during drag, commit once on
// release" rule used everywhere else a drag ends up in `settings` (see usePanelResize call sites) —
// but this one isn't a good fit for either existing composable: useDragReorder is drop-target/list
// based, and usePanelResize only moves one axis. The FAB is a single free-floating element, so it
// gets its own small handler here rather than a third composable for one caller.
//
// Distinguishing "tap to open" from "long-press to drag" without delaying the tap: a normal
// pointerdown->pointerup within LONG_PRESS_MS always still fires a plain `click` (we never call
// preventDefault on pointerdown), so quick taps are exactly as fast as before. Only if the timer
// actually fires do we flip into drag mode and start suppressing the click that would otherwise
// follow the pointerup.
const FAB_SIZE = 48 // keep in sync with .wb-fab's width/height in main.css
const FAB_DRAG_THRESHOLD = 4
const FAB_LONG_PRESS_MS = 100
const fabDragging = ref(false)
let fabLongPressTimer: ReturnType<typeof setTimeout> | null = null
let fabSuppressClick = false

function cancelFabLongPress() {
  if (fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null }
}

function clampFabPos(x: number, y: number) {
  const hostWin = getHostWindow()
  // Only clamps against the raw viewport box, not env(safe-area-inset-*) — reading a CSS env()
  // value back out in JS needs an extra getComputedStyle round-trip for marginal benefit here.
  // The CSS default position (bottom/right, see .wb-fab) still honors the safe-area media query;
  // this only applies once the user has actually dragged the FAB somewhere themselves.
  const maxX = Math.max(0, hostWin.innerWidth - FAB_SIZE)
  const maxY = Math.max(0, hostWin.innerHeight - FAB_SIZE)
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
}

const fabStyle = computed(() => {
  const pos = store.settings.fabPos
  if (!pos) return undefined
  return { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' }
})

function onFabPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const hostWin = getHostWindow()
  const fabEl = e.currentTarget as HTMLElement
  const startX = e.clientX, startY = e.clientY
  const pointerId = e.pointerId
  let dragging = false

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    if (!dragging) {
      // Moved before the long-press fired — not a drag start, let the pending timer keep
      // running only while the pointer is still basically still; once it's moved past the
      // threshold this was never a long-press to begin with (e.g. an accidental drag-ish
      // gesture), so cancel and leave it as a would-be plain click.
      if (Math.abs(ev.clientX - startX) < FAB_DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < FAB_DRAG_THRESHOLD) return
      cancelFabLongPress()
      return
    }
    const { x, y } = clampFabPos(ev.clientX - FAB_SIZE / 2, ev.clientY - FAB_SIZE / 2)
    store.settings.fabPos = { x, y } // draft only — not persisted to localStorage until release
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    cancelFabLongPress()
    hostWin.removeEventListener('pointermove', onMove)
    hostWin.removeEventListener('pointerup', onUp)
    hostWin.removeEventListener('pointercancel', onUp)
    if (dragging) {
      fabDragging.value = false
      store.saveSettings() // commit once, on release — same rule as panel-resize/color-picker settings
    }
  }
  hostWin.addEventListener('pointermove', onMove)
  hostWin.addEventListener('pointerup', onUp)
  hostWin.addEventListener('pointercancel', onUp)

  fabLongPressTimer = setTimeout(() => {
    fabLongPressTimer = null
    dragging = true
    fabDragging.value = true
    fabSuppressClick = true
    if (hostWin.navigator?.vibrate) hostWin.navigator.vibrate(40)
    // Freeze the FAB's current rendered box (still on the default bottom/right anchor the first
    // time this runs) into an explicit left/top so it can then follow the pointer freely.
    const r = fabEl.getBoundingClientRect()
    store.settings.fabPos = clampFabPos(r.left, r.top)
  }, FAB_LONG_PRESS_MS)
}

function onFabClick() {
  if (fabSuppressClick) { fabSuppressClick = false; return }
  openPanel()
}

// If a saved position is ever left stranded off-screen (most commonly: rotating a phone, or
// resizing a desktop browser window narrower after dragging the FAB near an edge), pull it back
// on the next resize rather than leaving it stuck somewhere unreachable.
function onHostResize() {
  const pos = store.settings.fabPos
  if (!pos) return
  const clamped = clampFabPos(pos.x, pos.y)
  if (clamped.x !== pos.x || clamped.y !== pos.y) {
    store.settings.fabPos = clamped
    store.saveSettings()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!store.panelOpen) return
  
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    onSave()
  }
}


onMounted(() => {
  onHostResize()
  getHostWindow().addEventListener('resize', onHostResize)
  getHostWindow().addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  getHostWindow().removeEventListener('resize', onHostResize)
  getHostWindow().removeEventListener('keydown', handleKeydown)
})

function openPanel() {
  store.panelOpen = true
  if (!store.hasData) store.loadFromContext()
}

/** RegexSidebar.vue（参数化改造后，见 regexProps.ts）拖拽 resize 时的实时宽度回调——这个赋值
 *  本身很便宜（就是改一个 ref），真正的持久化（localStorage 写入）单独在拖拽结束时通过
 *  onSidebarWidthCommit（绑的是 store.saveSettings）触发一次，理由见 RegexSidebarProps 里
 *  两个 prop 各自的 doc comment。 */
function setRegexSidebarWidth(w: number) { store.settings.sidebarWidth = w }

/** Save 按钮 / Ctrl+S 永远只对当前活跃工作区生效（见 TODO.md 1.6）——现在唯一存在的工作区是
 *  'preset'，这个 if 分支今天恒真，是特意留给阶段1/2的挂载点：worldbookStore/characterStore
 *  落地后这里会加 `else if (tabsStore.activeWorkspace === 'worldbook') worldbookStore.save()`
 *  这样的分支，Save 按钮的文案也会跟着 activeWorkspace 换成"保存世界书"/"保存角色卡"。这次先不
 *  提前为还不存在的 store 发明假分支——阶段0拆 sillytavern.ts 时特意强调过的"不要为将来可能的
 *  东西预先抽象"，这里同样适用。 */
function onSave() {
  if (tabsStore.activeWorkspace === 'preset') store.doSavePreset()
}

/** 每个工作区自己的"有没有未保存改动"，键是 workspace 字符串（跟 tabsStore.activeWorkspace/
 *  OpenTab.workspace 用的是同一套值）。放在这里而不是 tabsStore 里，是因为要汇总的
 *  `store.dirty`/以后的 `characterStore.dirty`/`worldbookStore.dirty` 分别来自各自的 domain
 *  store，tabsStore 不认识它们（presetStore 已经反过来 import tabsStore 了，tabsStore 再
 *  import 回 presetStore 会成环）——App.vue 是当前唯一同时认识所有 store 的地方，这份聚合
 *  只能长在这儿。等阶段1/2 真的做出顶层三态切换按钮时，"红点该不该亮"直接读这个 computed 就够，
 *  不用再重新想一遍怎么聚合。 */
const dirtyWorkspaces = computed<Record<string, boolean>>(() => ({
  preset: store.dirty,
  // 阶段1/2 落地后加：character: characterStore.dirty, worldbook: worldbookStore.dirty
}))

/** 面板右上角 ✕。以前是直接 `store.panelOpen = false`，没有任何脏检查——现在有多个工作区可能
 *  各自带着未保存改动（TODO.md 1.6：切工作区背景保活，不会自动帮你存），关闭整个面板前汇总提示
 *  一下，防止用户忘了哪个工作区还有东西没存。注意这不是"关闭会丢数据"的警告——面板关闭只是隐藏
 *  UI，数据仍在内存里（`openPanel()` 里 `if (!store.hasData)` 那个判断，重开面板不会丢），
 *  这里纯粹是个提醒，所以默认按钮不走 danger 红色样式。 */
function onClosePanel() {
  const items = Object.entries(dirtyWorkspaces.value)
    .filter(([, isDirty]) => isDirty)
    .map(([ws]) => {
      if (ws === 'preset') return { label: store.t('shared.confirm.closePanel.presetItem', { name: store.presetName || '—' }) }
      return { label: ws } // 阶段1/2 落地后这个兜底分支不会再被走到，届时会加各自的 i18n item 文案
    })
  if (!items.length) { store.panelOpen = false; return }
  confirmStore.askMulti({
    title: store.t('shared.confirm.closePanel.title'),
    message: store.t('shared.confirm.closePanel.message'),
    items,
    confirmText: store.t('shared.confirm.closePanel.confirm'),
    cancelText: store.t('common.cancel'),
    danger: false,
    onConfirm: () => { store.panelOpen = false },
  })
}

function toggleSearch() {
  store.searchOpen = !store.searchOpen
  if (store.searchOpen) store.doSearch()
}

// RULE: never call getHostWindow().confirm()/.prompt() — unreliable inside TauriTavern's
// WebView2 host. Everything goes through confirmStore instead (see confirmStore.ts).
function onPresetSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const name = select.value
  if (!name || name === store.presetName) return
  confirmStore.ask({
    title: store.t('shared.confirm.switchPreset.title'),
    message: store.t('shared.confirm.switchPreset.message', { name: esc(name) }),
    confirmText: store.t('shared.confirm.switchPreset.confirm'),
    cancelText: store.t('common.cancel'),
    danger: false,
    onConfirm: () => store.switchPreset(name),
    // The <select> isn't v-model two-way bound, so the browser already visually switched to
    // `name` the moment @change fired — if the user cancels, snap it back to what's actually
    // loaded (nothing else is guaranteed to trigger a re-render in the meantime).
    onCancel: () => { select.value = store.presetName },
  })
}

function onNewPreset() {
  confirmStore.askInput({
    title: store.t('shared.prompt.newPreset.title'),
    placeholder: store.t('shared.prompt.newPreset.placeholder'),
    confirmText: store.t('shared.prompt.newPreset.confirm'), 
    cancelText: store.t('shared.prompt.newPreset.cancel'),
    onConfirm: (name) => {
      store.createPreset(name)
    },
  })
}
function onDeletePreset() {
  if (!store.presetName) return
  confirmStore.ask({
    title: store.t('shared.confirm.deletePreset.title'),
    message: store.t('shared.confirm.deletePreset.message', { name: esc(store.presetName) }),
    confirmText: store.t('common.delete'),
    cancelText: store.t('common.cancel'),
    onConfirm: () => store.removeCurrentPreset(),
  })
}
</script>
