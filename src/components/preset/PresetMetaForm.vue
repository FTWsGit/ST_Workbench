<template>
  <div v-if="store.rawData" class="rx-form">
    <FormField :label="uiStore.t('preset.metaForm.contextLabel')">
      <input class="rx-input rx-num" type="number" v-model.number="maxContext" />
    </FormField>

    <FormField :label="uiStore.t('preset.metaForm.maxTokensLabel')">
      <input class="rx-input rx-num" type="number" v-model.number="maxTokens" />
    </FormField>

    <FormField :label="uiStore.t('preset.metaForm.repliesLabel')">
      <input class="rx-input rx-num" type="number" min="1" v-model.number="n" />
    </FormField>

    <label class="rx-check"><input type="checkbox" v-model="streamOpenai" /> {{ uiStore.t('preset.metaForm.streamLabel') }}</label>
    <label class="rx-check"><input type="checkbox" v-model="squashSystemMessages" /> {{ uiStore.t('preset.metaForm.squashLabel') }}</label>

    <AdvancedGroup :title="uiStore.t('preset.metaForm.samplingToggle')">
      <div class="wb-row">
        <label class="rx-label">{{ uiStore.t('preset.metaForm.temperatureLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="temperature" />
        <label class="rx-label">{{ uiStore.t('preset.metaForm.topPLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="topP" />
      </div>
      <div class="wb-row">
        <label class="rx-label">{{ uiStore.t('preset.metaForm.freqPenaltyLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="frequencyPenalty" />
        <label class="rx-label">{{ uiStore.t('preset.metaForm.presPenaltyLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="presencePenalty" />
      </div>
      <div class="wb-row">
        <label class="rx-label">{{ uiStore.t('preset.metaForm.repPenaltyLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="repetitionPenalty" />
        <label class="rx-label">{{ uiStore.t('preset.metaForm.minPLabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="minP" />
      </div>
      <div class="wb-row">
        <label class="rx-label">{{ uiStore.t('preset.metaForm.topKLabel') }}</label>
        <input class="rx-input rx-num" type="number" v-model.number="topK" />
        <label class="rx-label">{{ uiStore.t('preset.metaForm.topALabel') }}</label>
        <input class="rx-input rx-num" type="number" step="0.01" v-model.number="topA" />
      </div>
      <FormField :label="uiStore.t('preset.metaForm.seedLabel')">
        <input class="rx-input rx-num" type="number" v-model.number="seed" :placeholder="uiStore.t('preset.metaForm.seedHint')" />
      </FormField>
    </AdvancedGroup>
  </div>
  <p v-else class="pr-cp-empty">{{ uiStore.t('preset.toast.loadFirst') }}</p>
</template>

<script setup lang="ts">
/** 预设 Meta 表单：管理模型采样参数（整份文档级别，放悬浮窗而非 SettingsDock）。仅服务预设 domain，不参数化，直接 usePresetStore()。
 *  field() 是按 key 生成 computed(get/set+markDirty) 的小工厂，避免 14 个数值字段重复样板；
 *  `store.rawData!` 断言由模板顶层 v-if="store.rawData" 保证安全。 */
import { computed } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useUiStore } from '../../stores/uiStore'
import type { PresetData } from '../../types'
import AdvancedGroup from '../shared/AdvancedGroup.vue'
import FormField from '../shared/FormField.vue'

const store = usePresetStore()
const uiStore = useUiStore()

function field<K extends keyof PresetData>(key: K) {
  return computed<PresetData[K]>({
    get: () => store.rawData![key],
    set: (v) => { store.rawData![key] = v; store.markDirty() },
  })
}

const maxContext = field('openai_max_context')
const maxTokens = field('openai_max_tokens')
const n = field('n')
const streamOpenai = field('stream_openai')
const squashSystemMessages = field('squash_system_messages')
const temperature = field('temperature')
const topP = field('top_p')
const frequencyPenalty = field('frequency_penalty')
const presencePenalty = field('presence_penalty')
const repetitionPenalty = field('repetition_penalty')
const minP = field('min_p')
const topK = field('top_k')
const topA = field('top_a')
const seed = field('seed')
</script>
