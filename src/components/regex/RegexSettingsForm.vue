<template>
  <div v-if="script" class="rx-form">
    <label class="rx-check"><input type="checkbox" v-model="enabled" /> {{ props.t('regex.settings.enabled') }}</label>

    <label class="rx-label">{{ props.t('regex.settings.findRegexLabel') }}</label>
    <textarea class="rx-textarea" :class="{ invalid: !findValid }" rows="2" v-model="script.findRegex" :placeholder="props.t('regex.settings.findRegexPlaceholder')"></textarea>
    <p v-if="!findValid" class="rx-err">{{ props.t('regex.settings.findRegexInvalid') }}</p>

    <label class="rx-label">{{ props.t('regex.settings.scriptNameLabel') }}</label>
    <input class="rx-input" v-model="script.scriptName" :placeholder="props.t('regex.settings.scriptNamePlaceholder')" />

    <label class="rx-label">{{ props.t('regex.settings.placementLabel') }}</label>
    <div class="wb-row rx-checks">
      <label v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" class="rx-check">
        <input type="checkbox" :checked="script.placement.includes(opt.value)" @change="togglePlacement(opt.value)" />
        {{ props.t(opt.labelKey) }}
      </label>
    </div>

    <label class="rx-label">{{ props.t('regex.settings.surfaceLabel') }}</label>
    <div class="rx-surface">
      <button class="wb-btn sm" :class="{ active: script.markdownOnly && !script.promptOnly }" @click="setSurfaceMode('display')">{{ props.t('regex.settings.displayOnly') }}</button>
      <button class="wb-btn sm" :class="{ active: script.promptOnly && !script.markdownOnly }" @click="setSurfaceMode('prompt')">{{ props.t('regex.settings.promptOnly') }}</button>
      <button class="wb-btn sm" :class="{ active: script.markdownOnly && script.promptOnly }" @click="setSurfaceMode('both')">{{ props.t('regex.settings.both') }}</button>
    </div>

    <button class="wb-btn wb-advanced-toggle" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? '▾' : '▸' }} {{ props.t('regex.settings.advancedToggle') }}</button>
    <div v-if="advancedOpen" class="rx-advanced">
      <label class="rx-label" style="margin:0">{{ props.t('regex.settings.trimLabel') }}</label>
      <textarea class="rx-textarea" rows="3" v-model="trimStringsText"></textarea>
      <label class="rx-check"><input type="checkbox" v-model="script.runOnEdit" /> {{ props.t('regex.settings.runOnEdit') }}</label>
      <label class="rx-label" style="margin:0">{{ props.t('regex.settings.substituteLabel') }}</label>
      <select class="wb-select-wide" v-model.number="script.substituteRegex">
        <option v-for="o in SUBSTITUTE_OPTIONS" :key="o.value" :value="o.value">{{ props.t(o.labelKey) }}</option>
      </select>
      <div class="wb-row">
        <label class="rx-label" style="margin:0">{{ props.t('regex.settings.minDepth') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="minDepthModel" :placeholder="props.t('regex.settings.depthPlaceholder')" />
        <label class="rx-label" style="margin:0">{{ props.t('regex.settings.maxDepth') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="maxDepthModel" :placeholder="props.t('regex.settings.depthPlaceholder')" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* 正则三件套之一——参数化改造后不再 import usePresetStore()，见 regexProps.ts 顶部的
 * doc comment。tabsStore 是全局单例 store，跟背后是哪个 domain store 无关，继续直接用，
 * renameTab() 的 domain 参数也继续写死 'regex'（这是"这个组件是什么"，不是"数据从哪来"）。 */
import { ref, computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { REGEX_PLACEMENT_OPTIONS as PLACEMENT_OPTIONS, REGEX_SUBSTITUTE_OPTIONS as SUBSTITUTE_OPTIONS } from '../../types'
import { parseFindRegex } from '../../regexEngine'
import type { RegexSettingsFormProps } from './regexProps'

const props = defineProps<RegexSettingsFormProps>()

const tabsStore = useTabsStore()
const advancedOpen = ref(false)

const script = computed(() => props.scripts.find(r => r.id === tabsStore.activeTab?.key) ?? null)
const findValid = computed(() => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex))
const enabled = computed({
  get: () => !script.value?.disabled,
  set: (v: boolean) => { if (script.value) script.value.disabled = !v }
})
const trimStringsText = computed({
  get: () => (script.value?.trimStrings || []).join('\n'),
  set: (v: string) => { if (script.value) script.value.trimStrings = v.split('\n') }
})
const minDepthModel = computed({
  get: () => script.value?.minDepth ?? null,
  set: (v: any) => { if (script.value) script.value.minDepth = (v === null || v === '' || Number.isNaN(v)) ? null : v }
})
const maxDepthModel = computed({
  get: () => script.value?.maxDepth ?? null,
  set: (v: any) => { if (script.value) script.value.maxDepth = (v === null || v === '' || Number.isNaN(v)) ? null : v }
})
function togglePlacement(v: number) {
  if (!script.value) return
  const p = script.value.placement
  const i = p.indexOf(v)
  if (i >= 0) p.splice(i, 1); else p.push(v)
}
function setSurfaceMode(mode: 'display' | 'prompt' | 'both') {
  if (!script.value) return
  script.value.markdownOnly = mode === 'display' || mode === 'both'
  script.value.promptOnly = mode === 'prompt' || mode === 'both'
}
// 名字改了，同步一下已开标签的显示文字，不然标签栏上的名字和这里改完的对不上。用
// renameTab() 而不是 open()：这里逐字触发，open() 会顺带 requestListScroll()（侧边栏
// scrollIntoView smooth），每敲一个字都跑一次会跟输入渲染抢主线程，是可感知的卡顿——
// 见 PROJECT.md「已知问题」。renameTab() 只改标签文字，没有这个副作用。
watch(() => script.value?.scriptName, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('regex', script.value.id, name || props.t('common.unnamed'))
})
</script>
