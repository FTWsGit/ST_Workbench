<template>
  <div class="st-wb" :style="uiStore.cssVars">
    <Transition name="wb-fab">
      <button v-if="!uiStore.panelOpen" class="wb-fab" :class="{ dragging: fab.dragging }"
              :style="fab.style" @pointerdown="fab.onPointerDown" @click="fab.onClick">W</button>
    </Transition>

    <Transition name="wb-panel">
      <div v-if="uiStore.panelOpen" class="wb-panel">
        <div class="wb-header">
          <!-- 桌面端完整按钮行；移动端紧凑行（☰ / 保存 / 预设 / ⋯ / ✕），其余按钮收入下面的 ⋯ 操作表 -->
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

        <!-- 顶栏第二行：仅 preset/character 工作区需要"条目 vs 正则"二级切换；worldbook 没有独立于条目之外的集合，不渲染此行。 -->
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

        <!-- 移动端遮罩：任一抽屉/操作表打开时覆盖编辑区，点击关闭；桌面端不渲染。 -->
        <div v-if="isMobile && drawer.visible !== 'none'" class="wb-mobile-backdrop" @click="drawer.close"></div>

        <!-- 移动端 ⋯ 操作表：容纳紧凑顶栏塞不下的所有按钮。 -->
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
/** 三个 domain store 的新建/删除/切换/重载/保存接口统一查表，下面 onSave/onReload/… 都基于此表写通用逻辑。 */
const workspaceRegistry = createWorkspaceRegistry()

/** 顶栏第一行工作区切换（preset/worldbook/character）。第二行"条目/正则"切换独立于 activeWorkspace，不经此函数。 */
function switchWorkspace(workspace: string) {
  tabsStore.setActiveWorkspace(workspace)
}

/**
 * 移动端抽屉状态机：sidebar/varNav/preview/settingsDock 以 off-canvas 抽屉或底部弹层形式呈现，
 * 同一时间最多一个可见（drawer.visible）；'tools' 是 ⋯ 操作表本身而非面板。
 * 机制位于 useMobileWorkspaceDrawer.ts，领域无关，由 panels 表驱动。切换 workspace/集合时自动露出侧边栏；
 * 切换标签或触发 editorJump 时自动关闭当前浮层。
 */
const isMobile = useIsMobile()
const drawer = useMobileWorkspaceDrawer({
  isMobile,
  panels: [
    { key: 'varNav', isOpen: () => tabsStore.varNavOpen, setOpen: (open) => tabsStore.setVarNavOpen('preset', open) },
    { key: 'preview', isOpen: () => tabsStore.previewOpen, setOpen: (open) => tabsStore.setPreviewOpen('preset', open) },
    { key: 'settingsDock', isOpen: () => tabsStore.settingsDockOpen, setOpen: (open) => { if (tabsStore.settingsDockOpen !== open) tabsStore.toggleSettingsDock() } },
  ],
  /** 切换 workspace / "条目↔正则"集合后，自动露出侧边栏。 */
  revealSidebarOn: [() => tabsStore.activeWorkspace, () => tabsStore.sidebarCollection],
  /** 选中新标签或触发 editorJump（搜索/变量跳转）时，自动关闭当前浮层。 */
  closeOn: [() => tabsStore.activeId, () => presetStore.editorJump],
})

/** FAB 长按拖动（useFabDrag.ts），持久化到 uiStore.settings.fabPos；点击则打开面板。 */
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
  // 世界书/角色卡列表较轻，打开面板时顺带拉一次，避免首次切到对应工作区才等待网络请求
  worldbookStore.refreshWorldbookList()
  characterStore.refreshCharacterList()
}

/** RegexSidebar 拖拽改宽度的实时回调（只改 ref）；拖拽结束时通过 onSidebarWidthCommit 触发一次持久化。 */
function setRegexSidebarWidth(w: number) { uiStore.settings.sidebarWidth = w }

/** Save / Ctrl+S 永远只作用于当前活跃工作区。 */
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

/**
 * 各工作区是否有未保存改动的聚合（key 为 workspace 字符串）。
 * 放在 App.vue 而非 tabsStore，是因为三个 domain store 与 tabsStore 的依赖方向使得这里是唯一同时认识全部 store 的位置。
 */
const dirtyWorkspaces = computed<Record<string, boolean>>(() =>
  Object.fromEntries(Object.entries(workspaceRegistry).map(([k, a]) => [k, a.dirty()]))
)

/**
 * 面板右上角 ✕：若任一工作区有未保存改动，先汇总提示（仅提醒，数据仍在内存中不会丢失）；否则直接关闭。
 */
function onClosePanel() {
  const items = Object.entries(dirtyWorkspaces.value)
    .filter(([, isDirty]) => isDirty)
    .map(([ws]) => {
      const adapter = workspaceRegistry[ws as keyof typeof workspaceRegistry]
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

/** Search/VarNav/Preview 目前仅 preset 工作区使用，workspace 硬编码为 'preset'。 */
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

/** 动态 i18n key 拼接统一入口：`${adapter.key}.${suffix}`，显式 cast 为 LocaleKey；新增 workspace 时需配齐对应 key 集。 */
function workspaceKey(adapter: DocumentWorkspaceAdapter, suffix: string): LocaleKey {
  return `${adapter.key}.${suffix}` as LocaleKey
}

/**
 * workspaceRegistry 驱动的通用 CRUD：
 * - onWorkspaceSelect：切换工作区文档，若有未保存改动先确认；取消时把 <select> 值回弹到当前 id。
 * - onNewWorkspace：弹出命名框新建；若 adapter.confirmCreateIfDirty 且当前有未保存改动，先二次确认。
 * - onDeleteWorkspace：删除当前文档。
 */
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

/**
 * "从角色卡导入世界书"：唯一跨 domain 集成点。只读 characterStore.oldRaw（v1CharData），
 * character_book 位于 v2 数据 `oldRaw.data.character_book`（v1 顶层无此字段）。
 */
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
