<template>
  <div v-if="tabsStore.tabsInActiveWorkspace.length" class="wb-tabbar">
    <div
      v-for="t in tabsStore.tabsInActiveWorkspace"
      :key="t.domain + ':' + t.key"
      class="wb-tab"
      :class="{ active: tabsStore.activeId === t.domain + ':' + t.key }"
      @click="tabsStore.focus(t.domain, t.key)"
      @mousedown.middle="onCloseTab(t)"
      :title="t.label"
    >
      <span class="wb-tab-domain-dot" :class="'domain-' + t.domain"></span>
      <span class="wb-tab-label">{{ t.label }}</span>
      <span
        v-if="!isTabDirty(t)"
        class="wb-tab-close"
        :title="uiStore.t('common.close')"
        :aria-label="uiStore.t('common.close')"
        @click.stop="tabsStore.close(t.domain, t.key)"
      >
        <Icon name="close" />
      </span>
      <span
        v-else
        class="wb-tab-dirty-dot"
        :title="uiStore.t('common.unsavedChanges')"
        :aria-label="uiStore.t('common.unsavedChanges')"
        @click.stop="onCloseTab(t)"
      ></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore, type OpenTab } from '../../stores/tabsStore';
import { useUiStore } from '../../stores/uiStore';
import { useConfirmStore } from '../../stores/confirmStore';
import { createWorkspaceRegistry } from '../../stores/workspaceRegistry';
import { esc } from '../../lib/display';
import Icon from './Icon.vue';
const tabsStore = useTabsStore();
const uiStore = useUiStore();
const confirmStore = useConfirmStore();
const workspaceRegistry = createWorkspaceRegistry();

function isTabDirty(t: OpenTab) {
  return workspaceRegistry[t.workspace]?.isTabDirty(t.domain, t.key) ?? false;
}
function onCloseTab(t: OpenTab) {
  if (!isTabDirty(t)) {
    tabsStore.close(t.domain, t.key);
    return;
  }
  const adapter = workspaceRegistry[t.workspace];
  confirmStore.askSaveDiscard({
    title: uiStore.t('shared.confirm.unsavedTab.title'),
    message: uiStore.t('shared.confirm.unsavedTab.message', { name: esc(t.label) }),
    saveText: uiStore.t('common.save'),
    discardText: uiStore.t('common.dontSave'),
    cancelText: uiStore.t('common.cancel'),
    onSave: () => {
      adapter?.saveTab(t.domain, t.key);
      tabsStore.close(t.domain, t.key);
    },
    onDiscard: () => {
      adapter?.discardTab(t.domain, t.key);
      tabsStore.close(t.domain, t.key);
    },
  });
}
</script>
