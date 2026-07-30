<template>
  <div v-if="script" class="rx-form">
    <FormField inline>
      <span class="rx-label">{{ props.t('regex.settings.enabled') }}</span>
      <span class="wb-toggle-sw" :class="{ on: enabled }" @click="enabled = !enabled"></span>
    </FormField>

    <FormField :label="props.t('regex.settings.findRegexLabel')">
      <textarea class="rx-textarea" :class="{ invalid: !findValid }" rows="2" v-model="script.findRegex" :placeholder="props.t('regex.settings.findRegexPlaceholder')"></textarea>
      <p v-if="!findValid" class="rx-err">{{ props.t('regex.settings.findRegexInvalid') }}</p>
    </FormField>

    <FormField :label="props.t('regex.settings.scriptNameLabel')">
      <input class="rx-input" v-model="script.scriptName" :placeholder="props.t('regex.settings.scriptNamePlaceholder')" />
    </FormField>

    <FormField :label="props.t('regex.settings.placementLabel')">
      <div class="wb-row rx-checks">
        <label v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" class="rx-check">
          <input type="checkbox" :checked="script.placement.includes(opt.value)" @change="togglePlacement(opt.value)" />
          {{ props.t(opt.labelKey) }}
        </label>
      </div>
    </FormField>

    <FormField :label="props.t('regex.settings.surfaceLabel')">
      <div class="rx-surface">
        <button class="wb-btn sm" :class="{ active: script.markdownOnly && !script.promptOnly }" @click="setSurfaceMode('display')">{{ props.t('regex.settings.displayOnly') }}</button>
        <button class="wb-btn sm" :class="{ active: script.promptOnly && !script.markdownOnly }" @click="setSurfaceMode('prompt')">{{ props.t('regex.settings.promptOnly') }}</button>
        <button class="wb-btn sm" :class="{ active: script.markdownOnly && script.promptOnly }" @click="setSurfaceMode('both')">{{ props.t('regex.settings.both') }}</button>
      </div>
    </FormField>

    <AdvancedGroup :title="props.t('regex.settings.advancedToggle')">
      <FormField :label="props.t('regex.settings.trimLabel')">
        <textarea class="rx-textarea" rows="3" v-model="trimStringsText"></textarea>
      </FormField>
      <label class="rx-check"><input type="checkbox" v-model="script.runOnEdit" /> {{ props.t('regex.settings.runOnEdit') }}</label>

      <FormField :label="props.t('regex.settings.substituteLabel')" inline>
        <SegmentedControl v-model="substituteModel" :options="substituteOptions" />
      </FormField>

      <div class="wb-row">
        <label class="rx-label">{{ props.t('regex.settings.minDepth') }}</label>
        <NumberInput v-model="minDepthModel" :placeholder="props.t('regex.settings.depthPlaceholder')" />
        <label class="rx-label">{{ props.t('regex.settings.maxDepth') }}</label>
        <NumberInput v-model="maxDepthModel" :placeholder="props.t('regex.settings.depthPlaceholder')" />
      </div>
    </AdvancedGroup>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useTabsStore } from '../../stores/tabsStore'
import { REGEX_PLACEMENT_OPTIONS as PLACEMENT_OPTIONS, REGEX_SUBSTITUTE_OPTIONS as SUBSTITUTE_OPTIONS } from '../../types'
import { parseFindRegex } from '../../regexEngine'
import type { RegexSettingsFormProps } from './regexProps'
import AdvancedGroup from '../shared/AdvancedGroup.vue'
import SegmentedControl from '../shared/SegmentedControl.vue'
import NumberInput from '../shared/NumberInput.vue'
import FormField from '../shared/FormField.vue'

const props = defineProps<RegexSettingsFormProps>()

const tabsStore = useTabsStore()

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
const substituteOptions = computed(() => SUBSTITUTE_OPTIONS.map(o => ({ value: o.value, label: props.t(o.labelKey) })))
const substituteModel = computed({
  get: () => script.value?.substituteRegex ?? 0,
  set: (v: any) => { if (script.value) script.value.substituteRegex = Number(v) }
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
/** 同步标签名。用 renameTab() 而非 open()：open() 会触发侧边栏 scrollIntoView，每字输入会卡顿。 */
watch(() => script.value?.scriptName, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('regex', script.value.id, name || props.t('common.unnamed'))
})
</script>
