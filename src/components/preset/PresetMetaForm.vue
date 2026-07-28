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
/* 预设 Meta 表单（TODO.md 2.5b）——管理的是模型采样参数，属于"整份文档"而不是某个具体 prompt
 * block，所以放悬浮窗（MetaPanel.vue）而不是 SettingsDock（那边是按 activeTab 解析单条记录的）。
 * 不参数化（不像 regex 三件套那样接 props）：这个表单只服务预设 domain 一家，没有第二个宿主
 * store 会用到它，参数化没有意义，直接 usePresetStore()。
 *
 * field() 是个小工厂：14 个数值字段各自手写一遍 get/set + markDirty() 太啰嗦，収成一个函数按
 * key 生成——直接改 `store.rawData!.xxx` 这种写法在 PresetMetaForm 场景是安全的，因为整个组件
 * 树只在 `store.rawData` 非空时才挂载（模板顶层 v-if="store.rawData"），field() 内部的
 * `store.rawData!` 断言由这个前提保证，不是瞎断言。
 *
 * 【2026-07 二次重构】"采样参数" 折叠区换成共享的 AdvancedGroup.vue，去掉了本地的
 * samplingOpen ref + 手写切换按钮，跟 CharacterMetaForm.vue 是同一批遗留写法一起清理的。
 * 单字段换 FormField；temperature/topP 这几组"一行塞两对"保持手写 .wb-row，不套 FormField
 * （同样的理由，见 WorldbookSettingsForm.vue 顶部 doc comment）。 */
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
