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
/* 正则三件套之一——参数化改造后不再 import usePresetStore()，见 regexProps.ts 顶部的
 * doc comment。tabsStore 是全局单例 store，跟背后是哪个 domain store 无关，继续直接用，
 * renameTab() 的 domain 参数也继续写死 'regex'（这是"这个组件是什么"，不是"数据从哪来"）。
 *
 * 【2026-07 UI 重构】"高级选项" 换成共享的 AdvancedGroup.vue（跟 WorldbookSettingsForm.vue
 * 用的是同一个组件），去掉了本地的 advancedOpen ref + 手写的 wb-advanced-toggle 按钮。
 * substituteRegex 的 <select> 换成 SegmentedControl（3 个短选项，横排按钮比下拉框更直观），
 * minDepth/maxDepth 换成 NumberInput（拖拽手柄）。"启用" 换成跟侧边栏同款的 .wb-toggle-sw
 * 滑块。这些都只是换了外层控件，各字段原来是"裸 v-model"还是"包了 computed 的 v-model"
 * 一律不变，之前有没有调 markDirty() 现在也还是有没有——这个表单本来就不是靠根节点事件委托
 * 兜底脏检查的（不像 WorldbookSettingsForm.vue），没必要借这次重构顺带改这块逻辑。
 *
 * 【2026-07 二次重构】改用 FormField.vue（见该文件 doc comment），删掉了每个字段上手写的
 * style="margin:0"/style="margin-top:0"——现在靠 main.css 里的结构选择器自动处理。
 * minDepth/maxDepth 那组 .wb-row 双字段行、placement 那组 .wb-row.rx-checks 复选框行都保持
 * 手写不套 FormField，理由跟 WorldbookSettingsForm.vue 里 sticky/cooldown/delay 一样——
 * FormField 只管"一个 label 配一个控件"，这两处不是这个模式。 */
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
// 名字改了，同步一下已开标签的显示文字，不然标签栏上的名字和这里改完的对不上。用
// renameTab() 而不是 open()：这里逐字触发，open() 会顺带 requestListScroll()（侧边栏
// scrollIntoView smooth），每敲一个字都跑一次会跟输入渲染抢主线程，是可感知的卡顿——
// 见 PROJECT.md「已知问题」。renameTab() 只改标签文字，没有这个副作用。
watch(() => script.value?.scriptName, (name) => {
  if (script.value && name !== undefined) tabsStore.renameTab('regex', script.value.id, name || props.t('common.unnamed'))
})
</script>
