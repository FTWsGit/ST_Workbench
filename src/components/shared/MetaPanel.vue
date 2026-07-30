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
/** 元信息悬浮窗：描述"整份文档"的元信息（不嵌右侧栏），按 activeWorkspace 选择表单（preset/character），worldbook 无条目则整个面板不渲染。 */
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
