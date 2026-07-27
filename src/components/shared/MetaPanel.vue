<template>
  <FloatingPanelShell
    v-if="uiStore.metaPanelOpen && formComponent"
    :title="uiStore.t(tabsStore.activeWorkspace === 'character' ? 'character.metaForm.title' : 'preset.metaForm.title')"
    :close-title="uiStore.t('common.close')"
    :width="480" :height="560" :min-width="360" :min-height="320"
    @close="uiStore.metaPanelOpen = false"
  >
    <component :is="formComponent" />
  </FloatingPanelShell>
</template>

<script setup lang="ts">
/* 元信息悬浮窗（TODO.md 2.5b）——描述的是"整份文档"而非某个 block/entry，故意不嵌进右侧栏
 * （预设 domain 右侧已经挤了 preview + varPanel + settingsDock，塞不下），做成独立悬浮窗，复用
 * FloatingPanelShell（跟 CopyPanel.vue/WorldbookToolsPanel.vue 同一套）。
 *
 * 挂载哪个表单只看 tabsStore.activeWorkspace，不看 activeTab——同一时刻只有一个工作区在显示，
 * 不需要按 tab 解析（跟 SettingsDock.vue 那张按 activeTab.domain 查的 FORMS 表是两条不同的路，
 * 别弄混）。worldbook 故意没有条目：formComponent 查不到时是 undefined，上面 v-if 直接不渲染
 * 整个悬浮窗——切到世界书工作区时触发这个面板的按钮本身也不会渲染（见 App.vue），这里的判断是
 * 双保险，不是唯一防线。 */
import { computed } from 'vue'
import { useUiStore } from '../../stores/uiStore'
import { useTabsStore } from '../../stores/tabsStore'
import FloatingPanelShell from './FloatingPanelShell.vue'
import PresetMetaForm from '../preset/PresetMetaForm.vue'
import CharacterMetaForm from '../character/CharacterMetaForm.vue'

const uiStore = useUiStore()
const tabsStore = useTabsStore()

const META_FORMS: Record<string, any> = { preset: PresetMetaForm, character: CharacterMetaForm }
const formComponent = computed(() => META_FORMS[tabsStore.activeWorkspace])
</script>
