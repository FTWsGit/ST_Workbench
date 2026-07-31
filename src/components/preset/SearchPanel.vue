<template>
  <div class="wb-preset-search">
    <div class="wb-preset-search-bar">
      <input type="text" v-model="store.searchQuery" @input="store.doSearch()" :placeholder="uiStore.t('preset.search.placeholder')" @keydown.enter.prevent="store.navSearch($event.shiftKey ? -1 : 1)">
      <input type="text" v-model="store.searchReplace" :placeholder="uiStore.t('preset.search.replacePlaceholder')" class="wb-preset-search-repl-input" @keydown.enter.prevent="store.replaceCurrent()">
      <button class="wb-btn" @click="store.navSearch(-1)">◀</button>
      <button class="wb-btn" @click="store.navSearch(1)">▶</button>
      <button class="wb-btn" @click="store.replaceCurrent()">{{ uiStore.t('preset.search.replace') }}</button>
      <button class="wb-btn" @click="store.replaceAll()">{{ uiStore.t('preset.search.replaceAll') }}</button>
      <span class="wb-preset-search-count">{{ uiStore.t('preset.search.results', { count: store.searchResults.length }) }}</span>
    </div>
    <div class="wb-preset-search-results" v-if="store.searchResults.length">
      <div v-for="(r, i) in displayResults" :key="i"
           class="wb-preset-sr-item" :class="{ active: i === store.searchIdx }"
           @click="jumpTo(i)">
        <span class="wb-preset-sr-block">{{ r.blockName }}</span>
        <span class="wb-preset-sr-line">L{{ r.line + 1 }}</span>
        <span class="wb-preset-sr-ctx" v-html="renderCtx(r)"></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import { esc } from '../../utils'
import { SEARCH_MAX } from '../../types'
import type { SearchResult } from '../../types'

const store = usePresetStore()
const uiStore = useUiStore()
/** 搜索结果最多展示 SEARCH_MAX 条，避免巨量结果时渲染卡顿。 */
const displayResults = computed(() => store.searchResults.slice(0, SEARCH_MAX))

function renderCtx(r: SearchResult) {
  const b = esc(r.context.substring(0, r.ms)), m = esc(r.context.substring(r.ms, r.ms + r.ml)), a = esc(r.context.substring(r.ms + r.ml))
  return b + '<em>' + m + '</em>' + a
}
function jumpTo(i: number) {
  store.jumpToSearchResult(i)
}
</script>
