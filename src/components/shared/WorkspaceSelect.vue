<template>
  <!-- 顶栏统一文档选择器：按 activeWorkspace 从 workspaceSelect 取 list/当前 id/i18n key。
       列表非空时渲染 <select>；空但有当前文档时显示只读名字；都没有则什么都不渲染。 -->
  <select v-if="sel.hasList" class="pr-preset-select" :value="sel.currentId"
          @change="onSelect" :title="uiStore.t(sel.switchTitleKey)">
    <option v-if="orphan" :value="orphan.id" disabled>{{ orphan.label }}</option>
    <option v-for="it in sel.items" :key="it.id" :value="it.id">{{ it.label }}</option>
  </select>
  <span v-else-if="sel.fallbackText" class="pr-preset-name">{{ sel.fallbackText }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import { usePresetStore } from '../../stores/presetStore'
import { useWorldbookStore } from '../../stores/worldbookStore'
import { useCharacterStore } from '../../stores/characterStore'
import { createWorkspaceRegistry } from '../../stores/workspaceRegistry'
import { useConfirmStore } from '../../stores/confirmStore'
import { esc } from '../../utils'
import type { LocaleKey } from '../../i18n'

const uiStore = useUiStore()
const tabsStore = useTabsStore()
const presetStore = usePresetStore()
const worldbookStore = useWorldbookStore()
const characterStore = useCharacterStore()
const confirmStore = useConfirmStore()
const workspaceRegistry = createWorkspaceRegistry()

interface SelItem { id: string; label: string }
interface Sel {
  items: SelItem[]
  currentId: string
  hasList: boolean
  switchTitleKey: LocaleKey
  noneLoadedKey: LocaleKey
  fallbackText: string
}

const sel = computed<Sel>(() => {
  const ws = tabsStore.activeWorkspace
  if (ws === 'preset') return {
    items: presetStore.presetList.map(p => ({ id: p.name, label: p.name })),
    currentId: presetStore.presetName,
    hasList: presetStore.presetList.length > 0,
    switchTitleKey: 'preset.header.switch' as LocaleKey,
    noneLoadedKey: 'preset.header.noneLoaded' as LocaleKey,
    fallbackText: presetStore.presetName,
  }
  if (ws === 'worldbook') return {
    items: worldbookStore.worldbookList.map(n => ({ id: n, label: n })),
    currentId: worldbookStore.worldbookName,
    hasList: worldbookStore.worldbookList.length > 0,
    switchTitleKey: 'worldbook.header.switch' as LocaleKey,
    noneLoadedKey: 'worldbook.header.noneLoaded' as LocaleKey,
    fallbackText: worldbookStore.worldbookName,
  }
  return {
    items: characterStore.characterList.map(c => ({ id: c.avatar, label: c.name })),
    currentId: characterStore.character?.avatar || '',
    hasList: characterStore.characterList.length > 0,
    switchTitleKey: 'character.header.switch' as LocaleKey,
    noneLoadedKey: 'character.header.noneLoaded' as LocaleKey,
    fallbackText: characterStore.character?.name || '',
  }
})

/** 当前 select 里"选中项不在列表"时显示的 disabled 占位（列表已删除但 store 仍指向旧 id）。 */
const orphan = computed(() => {
  const s = sel.value
  if (!s.currentId) return null
  const inList = s.items.some(it => it.id === s.currentId)
  if (inList) return null
  return { id: s.currentId, label: s.fallbackText || uiStore.t(s.noneLoadedKey) }
})

function onSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const id = select.value
  const adapter = workspaceRegistry[tabsStore.activeWorkspace as keyof typeof workspaceRegistry]
  if (!id || id === adapter.currentId()) return
  const doSwitch = () => adapter.switchTo(id)
  if (adapter.dirty()) {
    confirmStore.ask({
      title: uiStore.t(`${adapter.key}.confirm.switch.title` as LocaleKey),
      message: uiStore.t(`${adapter.key}.confirm.switch.message` as LocaleKey, { name: esc(adapter.labelForId(id)) }),
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
</script>
