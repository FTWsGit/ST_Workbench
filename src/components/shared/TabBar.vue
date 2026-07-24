<template>
  <div v-if="tabs.tabs.length" class="wb-tabbar">
    <div v-for="t in tabs.tabs" :key="t.domain + ':' + t.key"
         class="wb-tab" :class="{ active: tabs.activeId === t.domain + ':' + t.key }"
         @click="tabs.focus(t.domain, t.key)"
         @mousedown.middle="tabs.close(t.domain, t.key)"
         :title="t.label">
      <span class="wb-tab-domain-dot" :class="'domain-' + t.domain"></span>
      <span class="wb-tab-label">{{ t.label }}</span>
      <span class="wb-tab-close" :title="store.t('shared.tabBar.close')" @click.stop="tabs.close(t.domain, t.key)">×</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTabsStore } from '../../stores/tabsStore'
import { usePresetStore } from '../../stores/presetStore'
const tabs = useTabsStore()
const store = usePresetStore()
</script>
