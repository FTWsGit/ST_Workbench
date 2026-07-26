<template>
  <div v-if="tabsStore.tabsInActiveWorkspace.length" class="wb-tabbar">
    <div v-for="t in tabsStore.tabsInActiveWorkspace" :key="t.domain + ':' + t.key"
         class="wb-tab" :class="{ active: tabsStore.activeId === t.domain + ':' + t.key }"
         @click="tabsStore.focus(t.domain, t.key)"
         @mousedown.middle="tabsStore.close(t.domain, t.key)"
         :title="t.label">
      <span class="wb-tab-domain-dot" :class="'domain-' + t.domain"></span>
      <span class="wb-tab-label">{{ t.label }}</span>
      <span class="wb-tab-close" :title="uiStore.t('shared.tabBar.close')" @click.stop="tabsStore.close(t.domain, t.key)">×</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore } from '../../stores/tabsStore'
import { useUiStore } from '../../stores/uiStore'
const tabsStore = useTabsStore()
const uiStore = useUiStore()
</script>
