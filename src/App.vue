<template>
  <div class="st-wb" :style="uiStore.cssVars">
    <Transition name="wb-fab">
      <button v-if="!uiStore.panelOpen" class="wb-fab" :class="{ dragging: fabDragging }"
              :style="fabStyle" @pointerdown="onFabPointerDown" @click="onFabClick">W</button>
    </Transition>

    <Transition name="wb-panel">
      <div v-if="uiStore.panelOpen" class="wb-panel">
        <div class="wb-header">
          <!-- Desktop: full button row, unchanged. Mobile: a compact row (☰ / Save / preset /
               ⋯ / ✕) — the rest of these buttons move into the ⋯ tools sheet below (see
               .wb-mobile-tools-sheet), since 8+ buttons don't fit a ~360px header no matter how
               much padding gets trimmed. -->
          <template v-if="!isMobile">
            <button class="wb-btn accent" @click="onSave()">{{ saveLabel }}</button>
            <div class="wb-sep"></div>
            <button class="wb-btn" @click="onReload()">{{ uiStore.t('shared.header.reload') }}</button>
             <button class="wb-btn" @click="uiStore.settingsOpen = true">{{ uiStore.t('shared.header.settings') }}</button>
            <div class="wb-sep"></div>
            <div class="wb-mode-switch">
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'preset' }" @click="switchMode('preset')">{{ uiStore.t('shared.header.mode.preset') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="switchMode('regex')">{{ uiStore.t('shared.header.mode.regex') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'character' }" @click="switchMode('character')">{{ uiStore.t('shared.header.mode.character') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.sidebarMode === 'worldbook' }" @click="switchMode('worldbook')">{{ uiStore.t('shared.header.mode.worldbook') }}</button>
            </div>
            <div class="wb-sep"></div>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <button class="wb-btn" @click="presetStore.copyPanelOpen = true">{{ uiStore.t('preset.header.copyBlocks') }}</button>
              <button class="wb-btn" :class="{ active: presetStore.searchOpen }" @click="toggleSearch">{{ uiStore.t('preset.header.search') }}</button>
              <button class="wb-btn" :class="{ active: uiStore.metaPanelOpen }" @click="uiStore.metaPanelOpen = !uiStore.metaPanelOpen">{{ uiStore.t('shared.header.meta') }}</button>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <button class="wb-btn" :class="{ active: uiStore.metaPanelOpen }" @click="uiStore.metaPanelOpen = !uiStore.metaPanelOpen">{{ uiStore.t('shared.header.meta') }}</button>
            </template>
            <div class="wb-spacer"></div>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <button class="wb-btn" :class="{ active: presetStore.varNavOpen }" @click="presetStore.varNavOpen = !presetStore.varNavOpen">{{ uiStore.t('preset.header.varNav') }}</button>
              <button class="wb-btn" :class="{ active: presetStore.previewOpen }" @click="presetStore.previewOpen = !presetStore.previewOpen">{{ uiStore.t('preset.header.preview') }}</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('preset.header.new')" @click="onNewPreset">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('preset.header.delete')" @click="onDeletePreset" :disabled="!presetStore.presetName">🗑</button>
              <select v-if="presetStore.presetList.length" class="pr-preset-select" :value="presetStore.presetName" @change="onPresetSelect($event)" :title="uiStore.t('preset.header.switch')">
                <option v-if="!presetStore.presetList.some(p => p.name === presetStore.presetName)" :value="presetStore.presetName" disabled>{{ presetStore.presetName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="p in presetStore.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
              <span v-else-if="presetStore.presetName" class="pr-preset-name">{{ presetStore.presetName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.new')" @click="onNewWorldbook">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.importFromCharacter')" :disabled="!embeddedCharacterBook" @click="onImportFromCharacterBook"> ⤓ </button>
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.delete')" @click="onDeleteWorldbook" :disabled="!worldbookStore.worldbookName">🗑</button>
              <select v-if="worldbookStore.worldbookList.length" class="pr-preset-select" :value="worldbookStore.worldbookName" @change="onWorldbookSelect($event)" :title="uiStore.t('worldbook.header.switch')">
                <option v-if="!worldbookStore.worldbookList.includes(worldbookStore.worldbookName)" :value="worldbookStore.worldbookName" disabled>{{ worldbookStore.worldbookName || uiStore.t('worldbook.header.noneLoaded') }}</option>
                <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else-if="worldbookStore.worldbookName" class="pr-preset-name">{{ worldbookStore.worldbookName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <button class="wb-btn icon-btn" :title="uiStore.t('character.header.new')" @click="onNewCharacter">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('character.header.delete')" @click="onDeleteCharacter" :disabled="!characterStore.character?.avatar">🗑</button>
              <select v-if="characterStore.characterList.length" class="pr-preset-select" :value="characterStore.character?.avatar || ''" @change="onCharacterSelect($event)" :title="uiStore.t('character.header.switch')">
                <option v-if="characterStore.character && !characterStore.characterList.some(c => c.avatar === characterStore.character?.avatar)" :value="characterStore.character?.avatar" disabled>{{ characterStore.character?.name || uiStore.t('character.header.noneLoaded') }}</option>
                <option v-for="c in characterStore.characterList" :key="c.avatar" :value="c.avatar">{{ c.name }}</option>
              </select>
              <span v-else-if="characterStore.character?.name" class="pr-preset-name">{{ characterStore.character.name }}</span>
            </template>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
          <template v-else>
            <button class="wb-mobile-hamburger" :title="uiStore.t('shared.mobile.sidebar')" @click="toggleMobileSidebar">☰</button>
            <button class="wb-btn accent" @click="onSave()">{{ saveLabel }}</button>
            <button class="wb-btn" @click="onReload()">{{ uiStore.t('shared.header.reload') }}</button>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <select v-if="presetStore.presetList.length" class="pr-preset-select" :value="presetStore.presetName" @change="onPresetSelect($event)" :title="uiStore.t('preset.header.switch')">
                <option v-if="!presetStore.presetList.some(p => p.name === presetStore.presetName)" :value="presetStore.presetName" disabled>{{ presetStore.presetName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="p in presetStore.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
              <span v-else-if="presetStore.presetName" class="pr-preset-name">{{ presetStore.presetName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <select v-if="characterStore.characterList.length" class="pr-preset-select" :value="characterStore.character?.avatar || ''" @change="onCharacterSelect($event)" :title="uiStore.t('character.header.switch')">
                <option v-if="characterStore.character && !characterStore.characterList.some(c => c.avatar === characterStore.character?.avatar)" :value="characterStore.character?.avatar" disabled>{{ characterStore.character?.name || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="c in characterStore.characterList" :key="c.avatar" :value="c.avatar">{{ c.name }}</option>
              </select>
              <span v-else-if="characterStore.character?.name" class="pr-preset-name">{{ characterStore.character.name }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
              <select v-if="worldbookStore.worldbookList.length" class="pr-preset-select" :value="worldbookStore.worldbookName" @change="onWorldbookSelect($event)" :title="uiStore.t('worldbook.header.switch')">
                <option v-if="!worldbookStore.worldbookList.includes(worldbookStore.worldbookName)" :value="worldbookStore.worldbookName" disabled>{{ worldbookStore.worldbookName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else-if="worldbookStore.worldbookName" class="pr-preset-name">{{ worldbookStore.worldbookName }}</span>
            </template>
            <div class="wb-spacer"></div>
            <button class="wb-mobile-tools-btn" :class="{ active: mobileDrawerVisible === 'tools' }" :title="uiStore.t('shared.mobile.tools')" @click="toggleMobileTools">⋯</button>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
        </div>

        <SearchPanel v-if="presetStore.searchOpen" /> 

        <div class="wb-main">
          <PresetSidebar v-if="tabsStore.sidebarMode === 'preset'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <RegexSidebar v-else-if="tabsStore.sidebarMode === 'regex'"
            :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'"
            :scripts="presetStore.regexScripts" workspace="preset" :t="uiStore.t"
            :on-add="presetStore.addRegexScript" :on-delete="presetStore.deleteRegexScript" :on-reorder="presetStore.reorderRegexScript"
            :sidebar-width="uiStore.settings.sidebarWidth"
            :on-sidebar-width-change="setRegexSidebarWidth"
            :on-sidebar-width-commit="uiStore.saveSettings" />
          <WorldbookSidebar v-else-if="tabsStore.sidebarMode === 'worldbook'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <CharacterSidebar v-else-if="tabsStore.sidebarMode === 'character'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <div class="wb-editor-col">
            <TabBar />
            <div class="wb-editor-row">
              <EditorShell />
              <SettingsDock :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'settingsDock' }" />
            </div>
          </div>
          <VarPanel v-if="presetStore.varNavOpen" :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'varNav' }" />
          <PreviewPanel v-if="presetStore.previewOpen" :class="{ 'wb-mobile-drawer-open': isMobile && mobileDrawerVisible === 'preview' }" />
        </div>

        <!-- Mobile-only: dims the editor behind whichever drawer/sheet is open, tap to close.
             Never rendered on desktop (v-if="isMobile"), where nothing here ever opens as an
             overlay in the first place. -->
        <div v-if="isMobile && mobileDrawerVisible !== 'none'" class="wb-mobile-backdrop" @click="closeMobileDrawer"></div>

        <!-- Mobile-only action sheet for everything that didn't fit the compact header row. -->
        <div v-if="isMobile" class="wb-mobile-tools-sheet" :class="{ 'wb-mobile-drawer-open': mobileDrawerVisible === 'tools' }">
          <div class="wb-mobile-tools-grip"></div>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'preset' }" @click="runTool(() => switchMode('preset'))">{{ uiStore.t('shared.header.mode.preset') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="runTool(() => switchMode('regex'))">{{ uiStore.t('shared.header.mode.regex') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'worldbook' }" @click="runTool(() => switchMode('worldbook'))">{{ uiStore.t('shared.header.mode.worldbook') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'character' }" @click="runTool(() => switchMode('character'))">{{ uiStore.t('shared.header.mode.character') }}</button>
          <template v-if="tabsStore.activeWorkspace === 'preset'">
            <button class="wb-mobile-tools-item" @click="runTool(() => { presetStore.copyPanelOpen = true })">{{ uiStore.t('preset.header.copyBlocks') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: presetStore.searchOpen }" @click="runTool(toggleSearch)">{{ uiStore.t('preset.header.search') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: uiStore.metaPanelOpen }" @click="runTool(() => { uiStore.metaPanelOpen = !uiStore.metaPanelOpen })">{{ uiStore.t('shared.header.meta') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'character'">
            <button class="wb-mobile-tools-item" :class="{ active: uiStore.metaPanelOpen }" @click="runTool(() => { uiStore.metaPanelOpen = !uiStore.metaPanelOpen })">{{ uiStore.t('shared.header.meta') }}</button>
          </template>
          <button class="wb-mobile-tools-item" @click="runTool(() => { uiStore.settingsOpen = true })">{{ uiStore.t('shared.header.settings') }}</button>
          <template v-if="tabsStore.activeWorkspace === 'preset'">
            <button class="wb-mobile-tools-item" :class="{ active: presetStore.varNavOpen }" @click="runTool(() => { presetStore.varNavOpen = !presetStore.varNavOpen })">{{ uiStore.t('preset.header.varNav') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: presetStore.previewOpen }" @click="runTool(() => { presetStore.previewOpen = !presetStore.previewOpen })">{{ uiStore.t('preset.header.preview') }}</button>
            <button class="wb-mobile-tools-item" @click="runTool(onNewPreset)">{{ uiStore.t('preset.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!presetStore.presetName" @click="runTool(onDeletePreset)">{{ uiStore.t('preset.header.delete') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
            <button class="wb-mobile-tools-item" @click="runTool(onNewWorldbook)">{{ uiStore.t('worldbook.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!embeddedCharacterBook" @click="runTool(onImportFromCharacterBook)">{{ uiStore.t('worldbook.header.importFromCharacter') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!worldbookStore.worldbookName" @click="runTool(onDeleteWorldbook)">{{ uiStore.t('worldbook.header.delete') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'character'">
            <button class="wb-mobile-tools-item" @click="runTool(onNewCharacter)">{{ uiStore.t('character.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!characterStore.character?.avatar" @click="runTool(onDeleteCharacter)">{{ uiStore.t('character.header.delete') }}</button>
          </template>
        </div>

        <!-- CopyPanel is now a real floating window (FloatingPanelShell, z-index 100010+, see
             useFloatingPanel.ts), not a .wb-modal-overlay — DOM order between it and Modals no
             longer matters for stacking. Modals' own overlay (settings/confirm/prompt/hidden-list)
             sits at z-index 300000, always above any floating panel regardless of source order,
             so confirm/prompt dialogs triggered from CopyPanel's own close()/loadSide()/removeBlock()
             remain reachable instead of getting trapped behind it. -->
        <CopyPanel />
        <MetaPanel />
        <Modals />
      </div>
    </Transition>
    <VarPopup />
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from './stores/presetStore'
import { useUiStore } from './stores/uiStore'
import SearchPanel from './components/preset/SearchPanel.vue'
import PresetSidebar from './components/preset/PresetSidebar.vue'
import VarPanel from './components/preset/VarPanel.vue'
import PreviewPanel from './components/preset/PreviewPanel.vue'
import VarPopup from './components/preset/VarPopup.vue'
import CopyPanel from './components/preset/CopyPanel.vue'
import MetaPanel from './components/shared/MetaPanel.vue'
import RegexSidebar from './components/regex/RegexSidebar.vue'
import WorldbookSidebar from './components/worldbook/WorldbookSidebar.vue'
import { useWorldbookStore } from './stores/worldbookStore'
import CharacterSidebar from './components/character/CharacterSidebar.vue'
import { useCharacterStore } from './stores/characterStore'
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
const presetStore = usePresetStore()
const uiStore = useUiStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()

/** sidebarMode 'preset'/'regex' 都属于 'preset' 工作区（正则是预设工作区内的子模式，不是独立
 *  工作区，见 tabsStore.ts OpenTab.workspace 的 doc comment）；'worldbook'/'character' 各自是独立
 *  工作区。切模式的同时把 activeWorkspace 也切过去——目前 sidebarMode 顶栏切换按钮就是唯一的顶层
 *  工作区切换 UI（TODO.md 1.4 提到的三态切换真正落地前，这俩概念先在这一个函数里合并着用）。
 *  角色卡工作区内部的 fields|regex 子切换（characterSidebarMode，TODO.md 1.5）不经过这个函数、
 *  不碰 tabsStore.sidebarMode——那是 CharacterSidebar.vue 自己的本地状态，见该文件顶部 doc
 *  comment，跟预设的 preset|regex 子切换（走这里的 sidebarMode）是两条独立的路。 */
function switchMode(mode: string) {
  tabsStore.setSidebarMode(mode)
  tabsStore.setActiveWorkspace(mode === 'worldbook' ? 'worldbook' : mode === 'character' ? 'character' : 'preset')
}

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
  if (mobileDrawerVisible.value === 'varNav') presetStore.varNavOpen = false
  else if (mobileDrawerVisible.value === 'preview') presetStore.previewOpen = false
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

watch(() => presetStore.varNavOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'varNav'
  else if (mobileDrawerVisible.value === 'varNav') mobileDrawerVisible.value = 'none'
})
watch(() => presetStore.previewOpen, (open) => {
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
// presetStore.ts) call requestEditorJump, which bumps presetStore.editorJump's token on every single
// call — including when the jump target is inside the tab that's ALREADY active, where
// tabsStore.activeId wouldn't change at all and the watcher above would never fire. Without this
// second watcher, jumping to a different variable/match inside the preset you're already editing
// left the var-nav/preview sheet sitting on top of the editor with nothing visibly happening —
// exactly the "click does nothing" symptom, just for the one case activeId alone can't catch.
watch(() => presetStore.editorJump, () => {
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
  const pos = uiStore.settings.fabPos
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
    uiStore.settings.fabPos = { x, y } // draft only — not persisted to localStorage until release
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    cancelFabLongPress()
    hostWin.removeEventListener('pointermove', onMove)
    hostWin.removeEventListener('pointerup', onUp)
    hostWin.removeEventListener('pointercancel', onUp)
    if (dragging) {
      fabDragging.value = false
      uiStore.saveSettings() // commit once, on release — same rule as panel-resize/color-picker settings
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
    uiStore.settings.fabPos = clampFabPos(r.left, r.top)
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
  const pos = uiStore.settings.fabPos
  if (!pos) return
  const clamped = clampFabPos(pos.x, pos.y)
  if (clamped.x !== pos.x || clamped.y !== pos.y) {
    uiStore.settings.fabPos = clamped
    uiStore.saveSettings()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!uiStore.panelOpen) return
  
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
  uiStore.panelOpen = true
  if (!presetStore.hasData) presetStore.loadFromContext()
  // 世界书/角色卡列表都比较轻（只是名字/头像数组），面板一打开就顺带拉一次，这样用户第一次切到
  // 对应工作区时顶栏下拉框已经有数据，不用切过去才现拉、白等一次网络请求。
  worldbookStore.refreshWorldbookList()
  characterStore.refreshCharacterList()
}

/** RegexSidebar.vue（参数化改造后，见 regexProps.ts）拖拽 resize 时的实时宽度回调——这个赋值
 *  本身很便宜（就是改一个 ref），真正的持久化（localStorage 写入）单独在拖拽结束时通过
 *  onSidebarWidthCommit（绑的是 uiStore.saveSettings）触发一次，理由见 RegexSidebarProps 里
 *  两个 prop 各自的 doc comment。 */
function setRegexSidebarWidth(w: number) { uiStore.settings.sidebarWidth = w }

/** Save 按钮 / Ctrl+S 永远只对当前活跃工作区生效（见 TODO.md 1.6）。阶段1落地世界书、阶段2落地
 *  角色卡，各加一个分支——三个工作区的判断完全并列，没有谁是默认兜底。 */
function onSave() {
  if (tabsStore.activeWorkspace === 'preset') presetStore.doSavePreset()
  else if (tabsStore.activeWorkspace === 'worldbook') worldbookStore.doSaveWorldbook()
  else if (tabsStore.activeWorkspace === 'character') characterStore.doSaveCharacter()
}
function onReload() {
  if (tabsStore.activeWorkspace === 'preset') {
    if (presetStore.dirty) {
      confirmStore.ask({
        title: uiStore.t('shared.confirm.unsaved.title'),
        message: uiStore.t('shared.confirm.unsaved.message'),
        confirmText: uiStore.t('common.confirm'),
        cancelText: uiStore.t('common.cancel'),
        onConfirm: () => presetStore.reloadPreset(),
      })
    } else { presetStore.reloadPreset() }
  }
  else if (tabsStore.activeWorkspace === 'worldbook') {
    if (worldbookStore.dirty) {
      confirmStore.ask({
        title: uiStore.t('shared.confirm.unsaved.title'),
        message: uiStore.t('shared.confirm.unsaved.message'),
        confirmText: uiStore.t('common.confirm'),
        cancelText: uiStore.t('common.cancel'),
        onConfirm: () => worldbookStore.reloadWorldbook(),
      })
    } else { worldbookStore.reloadWorldbook() }
  }
  else if (tabsStore.activeWorkspace === 'character') {
    if (characterStore.dirty) {
      confirmStore.ask({
        title: uiStore.t('shared.confirm.unsaved.title'),
        message: uiStore.t('shared.confirm.unsaved.message'),
        confirmText: uiStore.t('common.confirm'),
        cancelText: uiStore.t('common.cancel'),
        onConfirm: () => characterStore.reloadCharacter(),
      })
    } else { characterStore.reloadCharacter() }
  }
}
const saveLabel = computed(() => {
  const dirty = tabsStore.activeWorkspace === 'worldbook' ? worldbookStore.dirty
    : tabsStore.activeWorkspace === 'character' ? characterStore.dirty
    : presetStore.dirty
  return uiStore.t('shared.header.save', { star: dirty ? ' *' : '' })
})

/** 每个工作区自己的"有没有未保存改动"，键是 workspace 字符串（跟 tabsStore.activeWorkspace/
 *  OpenTab.workspace 用的是同一套值）。放在这里而不是 tabsStore 里，是因为要汇总的
 *  `presetStore.dirty`/`characterStore.dirty`/`worldbookStore.dirty` 分别来自各自的 domain
 *  store，tabsStore 不认识它们（presetStore 已经反过来 import tabsStore 了，tabsStore 再
 *  import 回 presetStore 会成环）——App.vue 是当前唯一同时认识所有 store 的地方，这份聚合
 *  只能长在这儿。 */
const dirtyWorkspaces = computed<Record<string, boolean>>(() => ({
  preset: presetStore.dirty,
  worldbook: worldbookStore.dirty,
  character: characterStore.dirty,
}))

/** 面板右上角 ✕。以前是直接 `uiStore.panelOpen = false`，没有任何脏检查——现在有多个工作区可能
 *  各自带着未保存改动（TODO.md 1.6：切工作区背景保活，不会自动帮你存），关闭整个面板前汇总提示
 *  一下，防止用户忘了哪个工作区还有东西没存。注意这不是"关闭会丢数据"的警告——面板关闭只是隐藏
 *  UI，数据仍在内存里（`openPanel()` 里 `if (!presetStore.hasData)` 那个判断，重开面板不会丢），
 *  这里纯粹是个提醒，所以默认按钮不走 danger 红色样式。 */
function onClosePanel() {
  const items = Object.entries(dirtyWorkspaces.value)
    .filter(([, isDirty]) => isDirty)
    .map(([ws]) => {
      if (ws === 'preset') return { label: uiStore.t('preset.confirm.closePanel.item', { name: presetStore.presetName || '—' }) }
      if (ws === 'worldbook') return { label: uiStore.t('worldbook.confirm.closePanel.item', { name: worldbookStore.worldbookName || '—' }) }
      if (ws === 'character') return { label: uiStore.t('character.confirm.closePanel.item', { name: characterStore.character?.name || '—' }) }
      return { label: ws } // 兜底：以后再加新工作区时，忘了在这里补一行也不会直接崩，只是标签不好看
    })
  if (!items.length) { uiStore.panelOpen = false; return }
  confirmStore.askMulti({
    title: uiStore.t('shared.confirm.closePanel.title'),
    message: uiStore.t('shared.confirm.closePanel.message'),
    items,
    confirmText: uiStore.t('common.close'),
    cancelText: uiStore.t('common.cancel'),
    danger: false,
    onConfirm: () => { uiStore.panelOpen = false },
  })
}

function toggleSearch() {
  presetStore.searchOpen = !presetStore.searchOpen
  if (presetStore.searchOpen) presetStore.doSearch()
}

// RULE: never call getHostWindow().confirm()/.prompt() — unreliable inside TauriTavern's
// WebView2 host. Everything goes through confirmStore instead (see confirmStore.ts).
function onPresetSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const name = select.value
  if (!name || name === presetStore.presetName) return
  const doSwitch = () => presetStore.switchPreset(name)
  if (presetStore.dirty) {
    confirmStore.ask({
      title: uiStore.t('preset.confirm.switch.title'),
      message: uiStore.t('preset.confirm.switch.message', { name: esc(name) }),
      confirmText: uiStore.t('common.switch'),
      cancelText: uiStore.t('common.cancel'),
      danger: false,
      onConfirm: doSwitch,
      // The <select> isn't v-model two-way bound, so the browser already visually switched to
      // `name` the moment @change fired — if the user cancels, snap it back to what's actually
      // loaded (nothing else is guaranteed to trigger a re-render in the meantime).
      onCancel: () => { select.value = presetStore.presetName },
    })
  } else {
    doSwitch()
  }
}

function onNewPreset() {
  confirmStore.askInput({
    title: uiStore.t('preset.prompt.new.title'),
    placeholder: uiStore.t('preset.prompt.new.placeholder'),
    confirmText: uiStore.t('common.create'), 
    cancelText: uiStore.t('common.cancel'),
    onConfirm: (name) => { presetStore.createPreset(name) },
  })
}
function onDeletePreset() {
  if (!presetStore.presetName) return
  confirmStore.ask({
    title: uiStore.t('preset.confirm.delete.title'),
    message: uiStore.t('preset.confirm.delete.message', { name: esc(presetStore.presetName) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => presetStore.removeCurrentPreset(),
  })
}

/* ====== 世界书：新建/删除/切换，跟上面几个 preset 版本是同一套模式（弹窗走 confirmStore，
 * 不用 window.prompt/confirm，见 confirmStore.ts 顶部 RULE）。 */
function onWorldbookSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const name = select.value
  if (!name || name === worldbookStore.worldbookName) return
  const doSwitch = () => worldbookStore.switchWorldbook(name)
  if (worldbookStore.dirty) {
    confirmStore.ask({
      title: uiStore.t('worldbook.confirm.switch.title'),
      message: uiStore.t('worldbook.confirm.switch.message', { name: esc(name) }),
      confirmText: uiStore.t('common.switch'),
      cancelText: uiStore.t('common.cancel'),
      danger: false,
      onConfirm: doSwitch,
      onCancel: () => { select.value = worldbookStore.worldbookName },
    })
  } else {
    doSwitch()
  }
}
function onNewWorldbook() {
  confirmStore.askInput({
    title: uiStore.t('worldbook.prompt.new.title'),
    placeholder: uiStore.t('worldbook.prompt.new.placeholder'),
    confirmText: uiStore.t('common.create'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: (name) => { worldbookStore.createNewWorldbook(name) },
  })
}

/* ====== "从角色卡导入"世界书（TODO.md 阶段3）======
 * 唯一的跨 domain 集成点：只读 characterStore.oldRaw（getCharacterByAvatar() 返回的原始
 * v1CharData，见 characterApi.ts），不摸 worldbookStore 以外的任何东西去改世界书数据——
 * worldbookStore.importFromCharacterBook() 本身不认识 characterStore，两个 domain store 互相
 * 独立（PROJECT.md「六个 Pinia store」的边界纪律），App.vue 是唯一允许"同时知道两边"的地方。
 * character_book 只在 v2CharData 里（`oldRaw.data.character_book`），v1 顶层没有这个字段。 */
const embeddedCharacterBook = computed<{ name?: string; entries?: any[] } | null>(() => characterStore.oldRaw?.data?.character_book ?? null)
function onImportFromCharacterBook() {
  const book = embeddedCharacterBook.value
  if (!book) { uiStore.showToast(uiStore.t('worldbook.toast.importNoBook')); return }
  const suggested = (typeof book.name === 'string' && book.name.trim())
    || `${characterStore.character?.name || ''}${uiStore.t('worldbook.prompt.import.suffix')}`
  confirmStore.askInput({
    title: uiStore.t('worldbook.prompt.import.title'),
    placeholder: uiStore.t('worldbook.prompt.new.placeholder'),
    initialValue: suggested,
    confirmText: uiStore.t('common.create'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: (name) => { worldbookStore.importFromCharacterBook(book, name) },
  })
}
function onDeleteWorldbook() {
  if (!worldbookStore.worldbookName) return
  confirmStore.ask({
    title: uiStore.t('worldbook.confirm.delete.title'),
    message: uiStore.t('worldbook.confirm.delete.message', { name: esc(worldbookStore.worldbookName) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => worldbookStore.removeCurrentWorldbook(),
  })
}

/* ====== 角色卡：新建/删除/切换，跟上面世界书那三个是同一套模式。切换角色用 avatar（文件名）
 * 当选中值——角色列表条目（CharacterListEntry）没有像世界书那样天然唯一的"名字"可以直接当 key
 * （重名角色在 ST 里是允许的，avatar 文件名才是真正唯一的标识）。 */
function onCharacterSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const avatar = select.value
  if (!avatar || avatar === characterStore.character?.avatar) return
  const doSwitch = () => characterStore.switchCharacter(avatar)
  if (characterStore.dirty) {
    confirmStore.ask({
      title: uiStore.t('character.confirm.switch.title'),
      message: uiStore.t('character.confirm.switch.message', { name: esc(characterStore.characterList.find(c => c.avatar === avatar)?.name || avatar) }),
      confirmText: uiStore.t('common.switch'),
      cancelText: uiStore.t('common.cancel'),
      danger: false,
      onConfirm: doSwitch,
      onCancel: () => { select.value = characterStore.character?.avatar || '' },
    })
  } else {
    doSwitch()
  }
}
function onNewCharacter() {
  const doCreate = () => confirmStore.askInput({
    title: uiStore.t('character.prompt.new.title'),
    placeholder: uiStore.t('character.prompt.new.placeholder'),
    confirmText: uiStore.t('common.create'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: (name) => { characterStore.createNewCharacter(name) },
  })
  if (characterStore.dirty) {
    confirmStore.ask({
      title: uiStore.t('shared.confirm.unsaved.title'),
      message: uiStore.t('character.confirm.newCharacter.message'),
      confirmText: uiStore.t('common.confirm'),
      cancelText: uiStore.t('common.cancel'),
      onConfirm: doCreate,
    })
  } else {
    doCreate()
  }
}
function onDeleteCharacter() {
  if (!characterStore.character?.avatar) return
  confirmStore.ask({
    title: uiStore.t('character.confirm.delete.title'),
    message: uiStore.t('character.confirm.delete.message', { name: esc(characterStore.character.name) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => characterStore.removeCurrentCharacter(),
  })
}
</script>
