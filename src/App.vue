<template>
  <div class="st-wb" :style="uiStore.cssVars">
    <Transition name="wb-fab">
      <button v-if="!uiStore.panelOpen" class="wb-fab" :class="{ dragging: fab.dragging }"
              :style="fab.style" @pointerdown="fab.onPointerDown" @click="fab.onClick">W</button>
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
              <button class="wb-btn sm" :class="{ active: tabsStore.activeWorkspace === 'preset' }" @click="switchWorkspace('preset')">{{ uiStore.t('shared.header.mode.preset') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.activeWorkspace === 'worldbook' }" @click="switchWorkspace('worldbook')">{{ uiStore.t('shared.header.mode.worldbook') }}</button>
              <button class="wb-btn sm" :class="{ active: tabsStore.activeWorkspace === 'character' }" @click="switchWorkspace('character')">{{ uiStore.t('shared.header.mode.character') }}</button>
            </div>
            <div class="wb-sep"></div>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <button class="wb-btn" @click="presetStore.copyPanelOpen = true">{{ uiStore.t('preset.header.copyBlocks') }}</button>
              <button class="wb-btn" :class="{ active: tabsStore.searchOpen }" @click="toggleSearch">{{ uiStore.t('preset.header.search') }}</button>
              <button class="wb-btn" :class="{ active: uiStore.metaPanelOpen }" @click="uiStore.metaPanelOpen = !uiStore.metaPanelOpen">{{ uiStore.t('shared.header.meta') }}</button>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <button class="wb-btn" :class="{ active: uiStore.metaPanelOpen }" @click="uiStore.metaPanelOpen = !uiStore.metaPanelOpen">{{ uiStore.t('shared.header.meta') }}</button>
            </template>
            <div class="wb-spacer"></div>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <button class="wb-btn" :class="{ active: tabsStore.varNavOpen }" @click="toggleVarNav">{{ uiStore.t('preset.header.varNav') }}</button>
              <button class="wb-btn" :class="{ active: tabsStore.previewOpen }" @click="togglePreview">{{ uiStore.t('preset.header.preview') }}</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('preset.header.new')" @click="onNewWorkspace(workspaceRegistry.preset)">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('preset.header.delete')" @click="onDeleteWorkspace(workspaceRegistry.preset)" :disabled="!presetStore.presetName">🗑</button>
              <select v-if="presetStore.presetList.length" class="pr-preset-select" :value="presetStore.presetName" @change="onWorkspaceSelect(workspaceRegistry.preset, $event)" :title="uiStore.t('preset.header.switch')">
                <option v-if="!presetStore.presetList.some(p => p.name === presetStore.presetName)" :value="presetStore.presetName" disabled>{{ presetStore.presetName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="p in presetStore.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
              <span v-else-if="presetStore.presetName" class="pr-preset-name">{{ presetStore.presetName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.new')" @click="onNewWorkspace(workspaceRegistry.worldbook)">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.importFromCharacter')" :disabled="!embeddedCharacterBook" @click="onImportFromCharacterBook"> ⤓ </button>
              <button class="wb-btn icon-btn" :title="uiStore.t('worldbook.header.delete')" @click="onDeleteWorkspace(workspaceRegistry.worldbook)" :disabled="!worldbookStore.worldbookName">🗑</button>
              <select v-if="worldbookStore.worldbookList.length" class="pr-preset-select" :value="worldbookStore.worldbookName" @change="onWorkspaceSelect(workspaceRegistry.worldbook, $event)" :title="uiStore.t('worldbook.header.switch')">
                <option v-if="!worldbookStore.worldbookList.includes(worldbookStore.worldbookName)" :value="worldbookStore.worldbookName" disabled>{{ worldbookStore.worldbookName || uiStore.t('worldbook.header.noneLoaded') }}</option>
                <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else-if="worldbookStore.worldbookName" class="pr-preset-name">{{ worldbookStore.worldbookName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <button class="wb-btn icon-btn" :title="uiStore.t('character.header.new')" @click="onNewWorkspace(workspaceRegistry.character)">+</button>
              <button class="wb-btn icon-btn" :title="uiStore.t('character.header.delete')" @click="onDeleteWorkspace(workspaceRegistry.character)" :disabled="!characterStore.character?.avatar">🗑</button>
              <select v-if="characterStore.characterList.length" class="pr-preset-select" :value="characterStore.character?.avatar || ''" @change="onWorkspaceSelect(workspaceRegistry.character, $event)" :title="uiStore.t('character.header.switch')">
                <option v-if="characterStore.character && !characterStore.characterList.some(c => c.avatar === characterStore.character?.avatar)" :value="characterStore.character?.avatar" disabled>{{ characterStore.character?.name || uiStore.t('character.header.noneLoaded') }}</option>
                <option v-for="c in characterStore.characterList" :key="c.avatar" :value="c.avatar">{{ c.name }}</option>
              </select>
              <span v-else-if="characterStore.character?.name" class="pr-preset-name">{{ characterStore.character.name }}</span>
            </template>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
          <template v-else>
            <button class="wb-mobile-hamburger" :title="uiStore.t('shared.mobile.sidebar')" @click="drawer.toggleSidebar">☰</button>
            <button class="wb-btn accent" @click="onSave()">{{ saveLabel }}</button>
            <button class="wb-btn" @click="onReload()">{{ uiStore.t('shared.header.reload') }}</button>
            <template v-if="tabsStore.activeWorkspace === 'preset'">
              <select v-if="presetStore.presetList.length" class="pr-preset-select" :value="presetStore.presetName" @change="onWorkspaceSelect(workspaceRegistry.preset, $event)" :title="uiStore.t('preset.header.switch')">
                <option v-if="!presetStore.presetList.some(p => p.name === presetStore.presetName)" :value="presetStore.presetName" disabled>{{ presetStore.presetName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="p in presetStore.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
              </select>
              <span v-else-if="presetStore.presetName" class="pr-preset-name">{{ presetStore.presetName }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'character'">
              <select v-if="characterStore.characterList.length" class="pr-preset-select" :value="characterStore.character?.avatar || ''" @change="onWorkspaceSelect(workspaceRegistry.character, $event)" :title="uiStore.t('character.header.switch')">
                <option v-if="characterStore.character && !characterStore.characterList.some(c => c.avatar === characterStore.character?.avatar)" :value="characterStore.character?.avatar" disabled>{{ characterStore.character?.name || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="c in characterStore.characterList" :key="c.avatar" :value="c.avatar">{{ c.name }}</option>
              </select>
              <span v-else-if="characterStore.character?.name" class="pr-preset-name">{{ characterStore.character.name }}</span>
            </template>
            <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
              <select v-if="worldbookStore.worldbookList.length" class="pr-preset-select" :value="worldbookStore.worldbookName" @change="onWorkspaceSelect(workspaceRegistry.worldbook, $event)" :title="uiStore.t('worldbook.header.switch')">
                <option v-if="!worldbookStore.worldbookList.includes(worldbookStore.worldbookName)" :value="worldbookStore.worldbookName" disabled>{{ worldbookStore.worldbookName || uiStore.t('preset.header.noneLoaded') }}</option>
                <option v-for="n in worldbookStore.worldbookList" :key="n" :value="n">{{ n }}</option>
              </select>
              <span v-else-if="worldbookStore.worldbookName" class="pr-preset-name">{{ worldbookStore.worldbookName }}</span>
            </template>
            <div class="wb-spacer"></div>
            <button class="wb-mobile-tools-btn" :class="{ active: drawer.visible === 'tools' }" :title="uiStore.t('shared.mobile.tools')" @click="drawer.toggleTools">⋯</button>
            <button class="wb-btn close-btn" @click="onClosePanel()">✕</button>
          </template>
        </div>

        <!-- 顶栏第二行：只有 preset/character 工作区内部才有"条目 vs 正则"这个二级选择要做——
             世界书条目里的"正则"是条目自己的字段（世界书条目有正则替换功能，但那是编辑单个条目
             时才会看到的选项，不是一个独立于世界书条目之外的集合），没有第二个集合可切，所以
             worldbook 工作区不渲染这一行，不会出现"渲染了一行但两个按钮长得一样没意义"的空转。
             视觉上刻意比第一行（.wb-mode-switch）矮/浅——这是它在信息架构里确实低一级的直接体现，
             不是随手调的样式：用户先选"预设/世界书/角色卡"这个工作区，选完之后才谈得上"在这个工作区
             里翻条目列表还是正则列表"，两者不是同一件事的两个选项。 -->
        <div v-if="tabsStore.activeWorkspace === 'preset' || tabsStore.activeWorkspace === 'character'" class="wb-collection-switch">
          <button class="wb-btn sm" :class="{ active: tabsStore.sidebarCollection !== 'regex' }"
                  @click="tabsStore.setSidebarCollection(tabsStore.activeWorkspace, tabsStore.activeWorkspace === 'character' ? 'fields' : 'items')">
            {{ tabsStore.activeWorkspace === 'character' ? uiStore.t('character.header.collectionFields') : uiStore.t('preset.header.collectionItems') }}
          </button>
          <button class="wb-btn sm" :class="{ active: tabsStore.sidebarCollection === 'regex' }"
                  @click="tabsStore.setSidebarCollection(tabsStore.activeWorkspace, 'regex')">
            {{ uiStore.t('shared.header.mode.regex') }}
          </button>
        </div>

        <SearchPanel v-if="tabsStore.searchOpen" /> 

        <div class="wb-main">
          <PresetSidebar v-if="tabsStore.activeWorkspace === 'preset' && tabsStore.sidebarCollection !== 'regex'" :mobile-drawer-open="isMobile && drawer.visible === 'sidebar'" />
          <RegexSidebar v-else-if="tabsStore.activeWorkspace === 'preset' && tabsStore.sidebarCollection === 'regex'"
            :mobile-drawer-open="isMobile && drawer.visible === 'sidebar'"
            :scripts="presetStore.regexScripts" workspace="preset" :t="uiStore.t"
            :on-add="presetStore.addRegexScript" :on-delete="presetStore.deleteRegexScript" :on-reorder="presetStore.reorderRegexScript"
            :sidebar-width="uiStore.settings.sidebarWidth"
            :on-sidebar-width-change="setRegexSidebarWidth"
            :on-sidebar-width-commit="uiStore.saveSettings" />
          <WorldbookSidebar v-else-if="tabsStore.activeWorkspace === 'worldbook'" :mobile-drawer-open="isMobile && drawer.visible === 'sidebar'" />
          <CharacterSidebar v-else-if="tabsStore.activeWorkspace === 'character' && tabsStore.sidebarCollection !== 'regex'" :mobile-drawer-open="isMobile && drawer.visible === 'sidebar'" />
          <RegexSidebar v-else-if="tabsStore.activeWorkspace === 'character' && tabsStore.sidebarCollection === 'regex'"
            :mobile-drawer-open="isMobile && drawer.visible === 'sidebar'"
            :scripts="characterStore.regexScripts" workspace="character" :t="uiStore.t"
            :on-add="characterStore.addRegexScript" :on-delete="characterStore.deleteRegexScript" :on-reorder="characterStore.reorderRegexScript"
            :sidebar-width="uiStore.settings.sidebarWidth"
            :on-sidebar-width-change="setRegexSidebarWidth"
            :on-sidebar-width-commit="uiStore.saveSettings" />
          <div class="wb-editor-col">
            <TabBar />
            <div class="wb-editor-row">
              <EditorShell />
              <SettingsDock :class="{ 'wb-mobile-drawer-open': isMobile && drawer.visible === 'settingsDock' }" />
            </div>
          </div>
          <VarPanel v-if="tabsStore.varNavOpen" :class="{ 'wb-mobile-drawer-open': isMobile && drawer.visible === 'varNav' }" />
          <PreviewPanel v-if="tabsStore.previewOpen" :class="{ 'wb-mobile-drawer-open': isMobile && drawer.visible === 'preview' }" />
        </div>

        <!-- Mobile-only: dims the editor behind whichever drawer/sheet is open, tap to close.
             Never rendered on desktop (v-if="isMobile"), where nothing here ever opens as an
             overlay in the first place. -->
        <div v-if="isMobile && drawer.visible !== 'none'" class="wb-mobile-backdrop" @click="drawer.close"></div>

        <!-- Mobile-only action sheet for everything that didn't fit the compact header row. -->
        <div v-if="isMobile" class="wb-mobile-tools-sheet" :class="{ 'wb-mobile-drawer-open': drawer.visible === 'tools' }">
          <div class="wb-mobile-tools-grip"></div>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.activeWorkspace === 'preset' }" @click="drawer.runTool(() => switchWorkspace('preset'))">{{ uiStore.t('shared.header.mode.preset') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.activeWorkspace === 'worldbook' }" @click="drawer.runTool(() => switchWorkspace('worldbook'))">{{ uiStore.t('shared.header.mode.worldbook') }}</button>
          <button class="wb-mobile-tools-item" :class="{ active: tabsStore.activeWorkspace === 'character' }" @click="drawer.runTool(() => switchWorkspace('character'))">{{ uiStore.t('shared.header.mode.character') }}</button>
          <template v-if="tabsStore.activeWorkspace === 'preset' || tabsStore.activeWorkspace === 'character'">
            <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarCollection !== 'regex' }"
                    @click="drawer.runTool(() => tabsStore.setSidebarCollection(tabsStore.activeWorkspace, tabsStore.activeWorkspace === 'character' ? 'fields' : 'items'))">
              {{ tabsStore.activeWorkspace === 'character' ? uiStore.t('character.header.collectionFields') : uiStore.t('preset.header.collectionItems') }}
            </button>
            <button class="wb-mobile-tools-item" :class="{ active: tabsStore.sidebarCollection === 'regex' }"
                    @click="drawer.runTool(() => tabsStore.setSidebarCollection(tabsStore.activeWorkspace, 'regex'))">
              {{ uiStore.t('shared.header.mode.regex') }}
            </button>
          </template>
          <template v-if="tabsStore.activeWorkspace === 'preset'">
            <button class="wb-mobile-tools-item" @click="drawer.runTool(() => { presetStore.copyPanelOpen = true })">{{ uiStore.t('preset.header.copyBlocks') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: tabsStore.searchOpen }" @click="drawer.runTool(toggleSearch)">{{ uiStore.t('preset.header.search') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: uiStore.metaPanelOpen }" @click="drawer.runTool(() => { uiStore.metaPanelOpen = !uiStore.metaPanelOpen })">{{ uiStore.t('shared.header.meta') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'character'">
            <button class="wb-mobile-tools-item" :class="{ active: uiStore.metaPanelOpen }" @click="drawer.runTool(() => { uiStore.metaPanelOpen = !uiStore.metaPanelOpen })">{{ uiStore.t('shared.header.meta') }}</button>
          </template>
          <button class="wb-mobile-tools-item" @click="drawer.runTool(() => { uiStore.settingsOpen = true })">{{ uiStore.t('shared.header.settings') }}</button>
          <template v-if="tabsStore.activeWorkspace === 'preset'">
            <button class="wb-mobile-tools-item" :class="{ active: tabsStore.varNavOpen }" @click="drawer.runTool(toggleVarNav)">{{ uiStore.t('preset.header.varNav') }}</button>
            <button class="wb-mobile-tools-item" :class="{ active: tabsStore.previewOpen }" @click="drawer.runTool(togglePreview)">{{ uiStore.t('preset.header.preview') }}</button>
            <button class="wb-mobile-tools-item" @click="drawer.runTool(() => onNewWorkspace(workspaceRegistry.preset))">{{ uiStore.t('preset.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!presetStore.presetName" @click="drawer.runTool(() => onDeleteWorkspace(workspaceRegistry.preset))">{{ uiStore.t('preset.header.delete') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'worldbook'">
            <button class="wb-mobile-tools-item" @click="drawer.runTool(() => onNewWorkspace(workspaceRegistry.worldbook))">{{ uiStore.t('worldbook.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!embeddedCharacterBook" @click="drawer.runTool(onImportFromCharacterBook)">{{ uiStore.t('worldbook.header.importFromCharacter') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!worldbookStore.worldbookName" @click="drawer.runTool(() => onDeleteWorkspace(workspaceRegistry.worldbook))">{{ uiStore.t('worldbook.header.delete') }}</button>
          </template>
          <template v-else-if="tabsStore.activeWorkspace === 'character'">
            <button class="wb-mobile-tools-item" @click="drawer.runTool(() => onNewWorkspace(workspaceRegistry.character))">{{ uiStore.t('character.header.new') }}</button>
            <button class="wb-mobile-tools-item" :disabled="!characterStore.character?.avatar" @click="drawer.runTool(() => onDeleteWorkspace(workspaceRegistry.character))">{{ uiStore.t('character.header.delete') }}</button>
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
import type { LocaleKey } from './i18n'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useIsMobile, getHostWindow } from './composables/hostEnv'
import { useFabDrag } from './composables/useFabDrag'
import { useMobileWorkspaceDrawer } from './composables/useMobileWorkspaceDrawer'
import { createWorkspaceRegistry, type DocumentWorkspaceAdapter } from './stores/workspaceRegistry'

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const presetStore = usePresetStore()
const uiStore = useUiStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()
// 三个 domain store 的新建/删除/切换/重载/保存接口统一查表，见 workspaceRegistry.ts 顶部
// doc comment——下面 onSave/onReload/dirtyWorkspaces/onWorkspaceSelect/onNewWorkspace/
// onDeleteWorkspace 都是照着这张表写的一份通用逻辑，不再是每个工作区各写一份。
const workspaceRegistry = createWorkspaceRegistry()

/** 顶栏第一行的三态工作区切换。第二行的"条目/正则"切换是完全独立的一条状态
 *  （tabsStore.sidebarCollection），不经过这个函数、不影响 activeWorkspace——两者是正交的两个
 *  轴，见 tabsStore.ts 里 sidebarCollectionByWorkspace 的 doc comment。 */
function switchWorkspace(workspace: string) {
  tabsStore.setActiveWorkspace(workspace)
}

// Mobile layout: sidebar/varNav/preview/settingsDock render as off-canvas overlays (left drawer
// for sidebar, bottom sheets for the other three — see main.css's @media (max-width) preset)
// instead of docked flex columns. At most one is visibly slid into view at a time
// (drawer.visible); 'tools' is the ⋯ action sheet itself, not a panel. Mechanism itself lives in
// useMobileWorkspaceDrawer.ts — it's domain-agnostic (doesn't know what varNav/preview/
// settingsDock even are), driven purely by the `panels` table below. Adding a future drawer (e.g.
// a worldbook-only search sheet) means adding one more entry to that table, not touching this
// composable.
const isMobile = useIsMobile()
const drawer = useMobileWorkspaceDrawer({
  isMobile,
  panels: [
    // varNav/preview 目前只对 'preset' 工作区渲染（见 VarPanel.vue/PreviewPanel.vue 顶部注释），
    // 所以关闭时写回的 workspace 硬编码成 'preset' 没问题——哪天这两个面板要支持别的 workspace，
    // 这里要跟着改成读 tabsStore.activeWorkspace，不能再硬编码。
    { key: 'varNav', isOpen: () => tabsStore.varNavOpen, setOpen: (open) => tabsStore.setVarNavOpen('preset', open) },
    { key: 'preview', isOpen: () => tabsStore.previewOpen, setOpen: (open) => tabsStore.setPreviewOpen('preset', open) },
    // settingsDockOpen 不是按 workspace 分桶存的（横跨所有工作区的单一开关），setOpen 用
    // toggleSettingsDock() 而不是直接赋值，因为 tabsStore 只暴露了 toggle，没有暴露 setter。
    { key: 'settingsDock', isOpen: () => tabsStore.settingsDockOpen, setOpen: (open) => { if (tabsStore.settingsDockOpen !== open) tabsStore.toggleSettingsDock() } },
  ],
  // 切换 workspace/切换"条目↔正则"集合之后，用户大概率想看刚才变化的那个侧边栏。
  revealSidebarOn: [() => tabsStore.activeWorkspace, () => tabsStore.sidebarCollection],
  // activeId 变化（选中了新标签）自然要收起浮层；presetStore.editorJump 额外覆盖"标签没变、但在
  // 已打开的标签内部跳到了别处"这种 activeId 不会变的场景（搜索结果/变量跳转都会触发它）——两个
  // 触发源都只是"收起当前浮层"，语义上都属于 closeOn。
  closeOn: [() => tabsStore.activeId, () => presetStore.editorJump],
})

// FAB long-press-to-move. Mechanism itself lives in useFabDrag.ts (domain-agnostic — doesn't
// know about uiStore or panels), this is just the glue wiring it to uiStore.settings.fabPos.
const fab = useFabDrag({
  getPos: () => uiStore.settings.fabPos,
  setPos: (pos) => { uiStore.settings.fabPos = pos },
  commit: () => uiStore.saveSettings(),
  onTap: () => openPanel(),
})

function handleKeydown(e: KeyboardEvent) {
  if (!uiStore.panelOpen) return
  
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    onSave()
  }
}


onMounted(() => {
  fab.onHostResize()
  getHostWindow().addEventListener('resize', fab.onHostResize)
  getHostWindow().addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  getHostWindow().removeEventListener('resize', fab.onHostResize)
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

/** Save 按钮 / Ctrl+S 永远只对当前活跃工作区生效（见 TODO.md 1.6）。 */
function onSave() {
  workspaceRegistry[tabsStore.activeWorkspace as keyof typeof workspaceRegistry]?.save()
}
function onReload() {
  const adapter = workspaceRegistry[tabsStore.activeWorkspace as keyof typeof workspaceRegistry]
  if (!adapter) return
  if (adapter.dirty()) {
    confirmStore.ask({
      title: uiStore.t('shared.confirm.unsaved.title'),
      message: uiStore.t('shared.confirm.unsaved.message'),
      confirmText: uiStore.t('common.confirm'),
      cancelText: uiStore.t('common.cancel'),
      onConfirm: () => adapter.reload(),
    })
  } else {
    adapter.reload()
  }
}
const saveLabel = computed(() => {
  const adapter = workspaceRegistry[tabsStore.activeWorkspace as keyof typeof workspaceRegistry]
  return uiStore.t('shared.header.save', { star: adapter?.dirty() ? ' *' : '' })
})

/** 每个工作区自己的"有没有未保存改动"，键是 workspace 字符串（跟 tabsStore.activeWorkspace/
 *  OpenTab.workspace 用的是同一套值）。放在这里而不是 tabsStore 里，是因为要汇总的
 *  `presetStore.dirty`/`characterStore.dirty`/`worldbookStore.dirty` 分别来自各自的 domain
 *  store，tabsStore 不认识它们（presetStore 已经反过来 import tabsStore 了，tabsStore 再
 *  import 回 presetStore 会成环）——App.vue 是当前唯一同时认识所有 store 的地方，这份聚合
 *  只能长在这儿。 */
const dirtyWorkspaces = computed<Record<string, boolean>>(() =>
  Object.fromEntries(Object.entries(workspaceRegistry).map(([k, a]) => [k, a.dirty()]))
)

/** 面板右上角 ✕。以前是直接 `uiStore.panelOpen = false`，没有任何脏检查——现在有多个工作区可能
 *  各自带着未保存改动（TODO.md 1.6：切工作区背景保活，不会自动帮你存），关闭整个面板前汇总提示
 *  一下，防止用户忘了哪个工作区还有东西没存。注意这不是"关闭会丢数据"的警告——面板关闭只是隐藏
 *  UI，数据仍在内存里（`openPanel()` 里 `if (!presetStore.hasData)` 那个判断，重开面板不会丢），
 *  这里纯粹是个提醒，所以默认按钮不走 danger 红色样式。 */
function onClosePanel() {
  const items = Object.entries(dirtyWorkspaces.value)
    .filter(([, isDirty]) => isDirty)
    .map(([ws]) => {
      const adapter = workspaceRegistry[ws as keyof typeof workspaceRegistry]
      // 兜底：以后再加新工作区时，忘了在 workspaceRegistry 里补一项也不会直接崩，只是标签不好看
      if (!adapter) return { label: ws }
      return { label: uiStore.t(workspaceKey(adapter, 'confirm.closePanel.item'), { name: adapter.currentLabel() }) }
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

// Search/VarNav/Preview 的开关状态本身活在 tabsStore（按 workspace 分桶存，见该文件 doc
// comment）；这三个面板目前都只对 'preset' 工作区渲染，所以这里 workspace 参数硬编码 'preset'。
function toggleSearch() {
  const next = !tabsStore.searchOpen
  tabsStore.setSearchOpen('preset', next)
  if (next) presetStore.doSearch()
}
function toggleVarNav() {
  tabsStore.setVarNavOpen('preset', !tabsStore.varNavOpen)
}
function togglePreview() {
  tabsStore.setPreviewOpen('preset', !tabsStore.previewOpen)
}

// RULE: never call getHostWindow().confirm()/.prompt() — unreliable inside TauriTavern's
// WebView2 host. Everything goes through confirmStore instead (see confirmStore.ts).
//
/** workspaceRegistry 驱动的通用 CRUD 弹窗要拼 `${adapter.key}.confirm.switch.title` 这种动态
 *  i18n key——LocaleKey 是从 zh-CN.ts 反推出来的字面量联合类型，TS 没法验证运行时拼出来的字符串
 *  一定落在这个联合里，这里显式 cast 一次，集中在这一个 helper 里，不在每个调用点各写一次。
 *  安全性靠人工保证：workspaceRegistry 里注册的每个 workspace，都必须在 i18n/locales/*.ts 里
 *  配齐 `<key>.confirm.switch.title/message`、`<key>.prompt.new.title/placeholder`、
 *  `<key>.confirm.delete.title/message`、`<key>.confirm.closePanel.item` 这一整套——现有
 *  preset/worldbook/character 三个已经核对过。以后往 registry 里加新 workspace 时这套 key 也要
 *  跟着配齐，忘了配不会编译期报错，只会在运行时退化成显示 key 本身，这是引入动态 key 换来的
 *  查表收益所付出的唯一代价。 */
function workspaceKey(adapter: DocumentWorkspaceAdapter, suffix: string): LocaleKey {
  return `${adapter.key}.${suffix}` as LocaleKey
}
//
// 下面三个函数取代了原来 preset/worldbook/character 各写一份的九个 onXxxSelect/onNewXxx/
// onDeleteXxx——三个 store 的方法形状、以及 i18n key 的命名（`${workspace}.confirm.switch.
// title` 这种）本来就已经是一致的，具体差异点（switch 确认弹窗里的显示名要不要反查列表、新建前
// 要不要多一次脏检查）都收在 workspaceRegistry.ts 的 labelForId/confirmCreateIfDirty 里显式
// 声明，这里不需要认识任何一个具体 workspace。
function onWorkspaceSelect(adapter: DocumentWorkspaceAdapter, e: Event) {
  const select = e.target as HTMLSelectElement
  const id = select.value
  if (!id || id === adapter.currentId()) return
  const doSwitch = () => adapter.switchTo(id)
  if (adapter.dirty()) {
    confirmStore.ask({
      title: uiStore.t(workspaceKey(adapter, 'confirm.switch.title')),
      message: uiStore.t(workspaceKey(adapter, 'confirm.switch.message'), { name: esc(adapter.labelForId(id)) }),
      confirmText: uiStore.t('common.switch'),
      cancelText: uiStore.t('common.cancel'),
      danger: false,
      onConfirm: doSwitch,
      // The <select> isn't v-model two-way bound, so the browser already visually switched to
      // `id` the moment @change fired — if the user cancels, snap it back to what's actually
      // loaded (nothing else is guaranteed to trigger a re-render in the meantime).
      onCancel: () => { select.value = adapter.currentId() },
    })
  } else {
    doSwitch()
  }
}

function onNewWorkspace(adapter: DocumentWorkspaceAdapter) {
  const openDialog = () => confirmStore.askInput({
    title: uiStore.t(workspaceKey(adapter, 'prompt.new.title')),
    placeholder: uiStore.t(workspaceKey(adapter, 'prompt.new.placeholder')),
    confirmText: uiStore.t('common.create'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: (name) => { adapter.create(name) },
  })
  if (adapter.confirmCreateIfDirty && adapter.dirty()) {
    confirmStore.ask({
      title: uiStore.t('shared.confirm.unsaved.title'),
      message: uiStore.t(adapter.confirmCreateIfDirty.messageKey as LocaleKey),
      confirmText: uiStore.t('common.confirm'),
      cancelText: uiStore.t('common.cancel'),
      onConfirm: openDialog,
    })
  } else {
    openDialog()
  }
}

function onDeleteWorkspace(adapter: DocumentWorkspaceAdapter) {
  if (!adapter.currentId()) return
  confirmStore.ask({
    title: uiStore.t(workspaceKey(adapter, 'confirm.delete.title')),
    message: uiStore.t(workspaceKey(adapter, 'confirm.delete.message'), { name: esc(adapter.currentLabel()) }),
    confirmText: uiStore.t('common.delete'),
    cancelText: uiStore.t('common.cancel'),
    onConfirm: () => adapter.remove(),
  })
}

/* ====== "从角色卡导入"世界书（TODO.md 阶段3）======
 * 唯一的跨 domain 集成点：只读 characterStore.oldRaw（getCharacterByAvatar() 返回的原始
 * v1CharData，见 characterApi.ts），不摸 worldbookStore 以外的任何东西去改世界书数据——
 * worldbookStore.importFromCharacterBook() 本身不认识 characterStore，两个 domain store 互相
 * 独立（PROJECT.md「六个 Pinia store」的边界纪律），App.vue 是唯一允许"同时知道两边"的地方。
 * character_book 只在 v2CharData 里（`oldRaw.data.character_book`），v1 顶层没有这个字段。
 * 这是真正的一次性跨 domain 逻辑，不属于上面三个通用 CRUD 函数覆盖的范畴，留在这里单独写。 */
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
</script>
