<template>
  <div v-if="script" class="wb-form">
    <FormField inline>
      <span class="wb-form-label">{{ props.t('regex.settings.enabled') }}</span>
      <span class="wb-toggle-sw" :class="{ on: enabled }" @click="enabled = !enabled"></span>
    </FormField>

    <FormField :label="props.t('regex.settings.findRegexLabel')">
      <textarea
        class="wb-form-textarea"
        :class="{ invalid: !findValid }"
        rows="2"
        v-model="script.findRegex"
        :placeholder="props.t('regex.settings.findRegexPlaceholder')"
      ></textarea>
      <p v-if="!findValid" class="wb-form-err">
        {{ props.t('regex.settings.findRegexInvalid') }}
      </p>
    </FormField>

    <FormField :label="props.t('regex.settings.scriptNameLabel')">
      <input
        class="wb-form-input"
        v-model="script.name"
        :placeholder="props.t('regex.settings.scriptNamePlaceholder')"
      />
    </FormField>

    <FormField :label="props.t('regex.settings.placementLabel')">
      <div class="wb-row wb-form-checks">
        <label v-for="opt in PLACEMENT_OPTIONS" :key="opt.value" class="wb-form-check">
          <input
            type="checkbox"
            :checked="script.placement.includes(opt.value)"
            @change="togglePlacement(opt.value)"
          />
          {{ props.t(opt.labelKey) }}
        </label>
      </div>
    </FormField>

    <FormField :label="props.t('regex.settings.surfaceLabel')">
      <div class="wb-btn-surface">
        <button
          class="wb-btn sm"
          :class="{ active: scopeMode === 'displayOnly' }"
          @click="setScopeMode('displayOnly')"
        >
          {{ props.t('regex.settings.displayOnly') }}
        </button>
        <button
          class="wb-btn sm"
          :class="{ active: scopeMode === 'promptOnly' }"
          @click="setScopeMode('promptOnly')"
        >
          {{ props.t('regex.settings.promptOnly') }}
        </button>
        <button
          class="wb-btn sm"
          :class="{ active: scopeMode === 'both' }"
          @click="setScopeMode('both')"
        >
          {{ props.t('regex.settings.both') }}
        </button>
      </div>
    </FormField>

    <AdvancedGroup :title="props.t('regex.settings.advancedToggle')">
      <FormField :label="props.t('regex.settings.trimLabel')">
        <textarea class="wb-form-textarea" rows="3" v-model="trimStringsText"></textarea>
      </FormField>
      <label class="wb-form-check"
        ><input type="checkbox" v-model="script.runOnEdit" />
        {{ props.t('regex.settings.runOnEdit') }}</label
      >

      <FormField :label="props.t('regex.settings.substituteLabel')" inline>
        <SegmentedControl v-model="substituteModel" :options="substituteOptions" />
      </FormField>

      <div class="wb-row">
        <label class="wb-form-label">{{ props.t('regex.settings.minDepth') }}</label>
        <NumberInput
          v-model="minDepthModel"
          :placeholder="props.t('regex.settings.depthPlaceholder')"
        />
        <label class="wb-form-label">{{ props.t('regex.settings.maxDepth') }}</label>
        <NumberInput
          v-model="maxDepthModel"
          :placeholder="props.t('regex.settings.depthPlaceholder')"
        />
      </div>
    </AdvancedGroup>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useTabsStore } from '../../stores/tabsStore';
import {
  REGEX_PLACEMENT_OPTIONS as PLACEMENT_OPTIONS,
  REGEX_SUBSTITUTE_OPTIONS as SUBSTITUTE_OPTIONS,
} from '../../types';
import type { RegexScript } from '../../types';
import { parseFindRegex } from '../../lib/regexEngine';
import type { RegexSettingsFormProps } from './regexProps';
import AdvancedGroup from '../shared/AdvancedGroup.vue';
import SegmentedControl from '../shared/SegmentedControl.vue';
import NumberInput from '../shared/NumberInput.vue';
import FormField from '../shared/FormField.vue';

const props = defineProps<RegexSettingsFormProps>();

const tabsStore = useTabsStore();

const script = computed(() => props.scripts.find((r) => r.id === tabsStore.activeTab?.key) ?? null);
const findValid = computed(
  () => !script.value || !script.value.findRegex || !!parseFindRegex(script.value.findRegex)
);
const enabled = computed({
  get: () => script.value?.enabled ?? false,
  set: (v: boolean) => {
    if (script.value) script.value.enabled = v;
  },
});
const trimStringsText = computed({
  get: () => (script.value?.trimStrings || []).join('\n'),
  set: (v: string) => {
    if (script.value) script.value.trimStrings = v.split('\n');
  },
});
const minDepthModel = computed({
  get: () => script.value?.depth.minDepth ?? null,
  set: (v: number | null) => {
    if (script.value) script.value.depth.minDepth = v === null || Number.isNaN(v) ? null : v;
  },
});
const maxDepthModel = computed({
  get: () => script.value?.depth.maxDepth ?? null,
  set: (v: number | null) => {
    if (script.value) script.value.depth.maxDepth = v === null || Number.isNaN(v) ? null : v;
  },
});
const substituteOptions = computed(() =>
  SUBSTITUTE_OPTIONS.map((o) => ({
    value: o.value,
    label: props.t(o.labelKey),
  }))
);
const substituteModel = computed({
  get: () => script.value?.substituteRegex ?? 'none',
  set: (v: unknown) => {
    if (script.value) script.value.substituteRegex = v as RegexScript['substituteRegex'];
  },
});
const scopeMode = computed<'displayOnly' | 'promptOnly' | 'both'>(() => {
  const s = script.value;
  if (!s) return 'both';
  const d = s.scope.includes('displayOnly');
  const p = s.scope.includes('promptOnly');
  if (d && p) return 'both';
  if (d) return 'displayOnly';
  if (p) return 'promptOnly';
  return 'both';
});
function togglePlacement(v: RegexScript['placement'][number]) {
  if (!script.value) return;
  const p = script.value.placement;
  const i = p.indexOf(v);
  if (i >= 0) p.splice(i, 1);
  else p.push(v);
}
function setScopeMode(mode: 'displayOnly' | 'promptOnly' | 'both') {
  if (!script.value) return;
  if (mode === 'both') script.value.scope = ['displayOnly', 'promptOnly'];
  else script.value.scope = [mode];
}
/** 同步标签名。用 renameTab() 而非 open()：open() 会触发侧边栏 scrollIntoView，每字输入会卡顿。 */
watch(
  () => script.value?.name,
  (name) => {
    if (script.value && name !== undefined)
      tabsStore.renameTab('regex', script.value.id, name || props.t('common.unnamed'));
  }
);
</script>
