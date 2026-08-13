<template>
  <div v-if="entry" class="wb-form" @change="store.markDirty()" @input="store.markDirty()">
    <FormField inline>
      <span class="wb-form-label">{{ uiStore.t('worldbook.settings.enabled') }}</span>
      <span class="wb-toggle-sw" :class="{ on: enabled }" @click="enabled = !enabled"></span>
    </FormField>

    <FormField :label="uiStore.t('worldbook.settings.commentLabel')">
      <input
        class="wb-form-input"
        v-model="entry.name"
        :placeholder="uiStore.t('worldbook.settings.commentPlaceholder')"
        @input="onNameInput"
      />
    </FormField>

    <!-- 其余字段按语义分到 4 个可折叠分组：激活策略 / 插入位置 / 递归与匹配 / 特殊效果 -->

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupActivation')" default-open>
      <FormField :label="uiStore.t('worldbook.settings.activationLabel')">
        <div class="wb-btn-surface">
          <button
            class="wb-btn sm"
            :class="{ active: activationMode === 'keyWord' }"
            @click="setActivation('keyWord')"
          >
            {{ uiStore.t('worldbook.activation.keyWord') }}
          </button>
          <button
            class="wb-btn sm"
            :class="{ active: activationMode === 'constant' }"
            @click="setActivation('constant')"
          >
            {{ uiStore.t('worldbook.activation.constant') }}
          </button>
          <button
            class="wb-btn sm"
            :class="{ active: activationMode === 'vectorized' }"
            @click="setActivation('vectorized')"
          >
            {{ uiStore.t('worldbook.activation.vectorized') }}
          </button>
        </div>
      </FormField>

      <!-- 关键词框仅在 keyWord 激活下有意义；constant/vectorized 不参与关键词匹配 -->
      <template v-if="activationMode === 'keyWord'">
        <FormField :label="uiStore.t('worldbook.settings.keysLabel')">
          <textarea
            class="wb-form-textarea"
            rows="2"
            v-model="keysText"
            :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"
          ></textarea>
        </FormField>

        <template v-if="entry.strategy.type === 'keyword'">
          <FormField :label="uiStore.t('worldbook.settings.keysSecondaryLabel')">
            <textarea
              class="wb-form-textarea"
              rows="2"
              v-model="keysSecondaryText"
              :placeholder="uiStore.t('worldbook.settings.keysPlaceholder')"
            ></textarea>
          </FormField>
          <FormField :label="uiStore.t('worldbook.settings.logicLabel')" inline>
            <select v-model="entry.strategy.keysSecondary.logic">
              <option v-for="o in LOGIC_OPTIONS" :key="o.value" :value="o.value">
                {{ uiStore.t(o.labelKey) }}
              </option>
            </select>
          </FormField>
        </template>
      </template>

      <FormField inline>
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.probabilityLabel') }}</label>
        <NumberInput v-model="entry.probability" :min="0" :max="100" :nullable="false" />
      </FormField>
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupPosition')">
      <FormField :label="uiStore.t('worldbook.settings.positionLabel')" inline>
        <select v-model="entry.position.type">
          <option v-for="o in POSITION_OPTIONS" :key="o.value" :value="o.value">
            {{ uiStore.t(o.labelKey) }}
          </option>
        </select>
      </FormField>
      <div v-if="entry.position.type === 'at_depth'" class="wb-row">
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.depthLabel') }}</label>
        <NumberInput v-model="entry.position.depth" :nullable="false" />
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.roleLabel') }}</label>
        <select v-model="roleModel">
          <option v-for="o in ROLE_OPTIONS" :key="String(o.value)" :value="o.value">
            {{ uiStore.t(o.labelKey) }}
          </option>
        </select>
      </div>
      <FormField :label="uiStore.t('worldbook.settings.orderLabel')" inline>
        <NumberInput v-model="entry.position.order" :nullable="false" />
      </FormField>
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupRecursion')">
      <label class="wb-form-check"
        ><input type="checkbox" v-model="entry.recursion.preventIncoming" />
        {{ uiStore.t('worldbook.settings.excludeRecursion') }}</label
      >
      <label class="wb-form-check"
        ><input type="checkbox" v-model="entry.recursion.preventOutgoing" />
        {{ uiStore.t('worldbook.settings.preventRecursion') }}</label
      >

      <FormField :label="uiStore.t('worldbook.settings.delayUntilRecursion')" inline>
        <NumberInput v-model="delayUntilRecursionModel" placeholder="1" />
      </FormField>

      <FormField :label="uiStore.t('worldbook.settings.scanDepthLabel')" inline>
        <NumberInput
          v-model="scanDepthModel"
          :placeholder="uiStore.t('worldbook.settings.sameAsGlobal')"
        />
      </FormField>

      <!-- 大小写/全词匹配仅在关键词激活下参与匹配 -->
      <template v-if="activationMode === 'keyWord'">
        <FormField :label="uiStore.t('worldbook.settings.caseSensitiveLabel')" inline>
          <SegmentedControl v-model="caseSensitiveModel" :options="tristateOptions" />
        </FormField>
        <FormField :label="uiStore.t('worldbook.settings.matchWholeWordsLabel')" inline>
          <SegmentedControl v-model="matchWholeWordsModel" :options="tristateOptions" />
        </FormField>
      </template>
    </AdvancedGroup>

    <AdvancedGroup :title="uiStore.t('worldbook.settings.groupEffects')">
      <div class="wb-row">
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.stickyLabel') }}</label>
        <NumberInput v-model="stickyModel" />
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.cooldownLabel') }}</label>
        <NumberInput v-model="cooldownModel" />
        <label class="wb-form-label">{{ uiStore.t('worldbook.settings.delayLabel') }}</label>
        <NumberInput v-model="delayModel" />
      </div>
    </AdvancedGroup>
  </div>
</template>

<script setup lang="ts">
/**
 * 世界书条目设置表单：直接 useWorldbookStore()（不参数化）。
 * 主表单只放 comment / enabled，其余字段按语义分到 4 个 AdvancedGroup。
 * markDirty 由 .wb-form 根节点 @change/@input 事件委托兜底；SegmentedControl/NumberInput
 * 通过各自 computed setter 手动 markDirty（按钮点击/拖拽不触发原生 change/input，NumberInput 内部在拖拽结束时派发 input 事件）。
 */
import { computed, watch } from 'vue';
import { useTabsStore } from '../../stores/tabsStore';
import { useWorldbookStore } from '../../stores/worldbookStore';
import { useUiStore } from '../../stores/uiStore';
import {
  WORLDBOOK_POSITION_OPTIONS as POSITION_OPTIONS,
  WORLDBOOK_LOGIC_OPTIONS as LOGIC_OPTIONS,
  WORLDBOOK_ROLE_OPTIONS as ROLE_OPTIONS,
} from '../../types';
import AdvancedGroup from '../shared/AdvancedGroup.vue';
import SegmentedControl from '../shared/SegmentedControl.vue';
import NumberInput from '../shared/NumberInput.vue';
import FormField from '../shared/FormField.vue';

const tabsStore = useTabsStore();
const store = useWorldbookStore();
const uiStore = useUiStore();

const entry = computed(() => store.currentEntry);

const enabled = computed({
  get: () => entry.value?.enabled ?? false,
  set: (v: boolean) => {
    if (entry.value) {
      entry.value.enabled = v;
      store.markDirty();
    }
  },
});

const activationMode = computed(() => {
  if (!entry.value) return 'keyWord';
  if (entry.value.strategy.type === 'constant') return 'constant';
  if (entry.value.strategy.type === 'vectorized') return 'vectorized';
  return 'keyWord';
});
function setActivation(mode: 'keyWord' | 'constant' | 'vectorized') {
  if (!entry.value) return;
  entry.value.strategy.type = mode === 'keyWord' ? 'keyword' : mode;
  store.markDirty();
}

const keysText = computed({
  get: () => (entry.value?.strategy.keys || []).join(', '),
  set: (v: string) => {
    if (entry.value) {
      entry.value.strategy.keys = v
        .replace(/[\n\t]/g, ',')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      store.markDirty();
    }
  },
});
const keysSecondaryText = computed({
  get: () => (entry.value?.strategy.keysSecondary.keys || []).join(', '),
  set: (v: string) => {
    if (entry.value) {
      entry.value.strategy.keysSecondary.keys = v
        .replace(/[\n\t]/g, ',')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      store.markDirty();
    }
  },
});

const roleModel = computed({
  get: () => entry.value?.position.role ?? null,
  set: (v: unknown) => {
    if (entry.value) {
      entry.value.position.role =
        v === '' || v == null ? null : (v as 'system' | 'user' | 'assistant');
      store.markDirty();
    }
  },
});

const delayUntilRecursionModel = computed({
  get: () => {
    const v = entry.value?.recursion.delayUntil;
    return typeof v === 'number' ? v : null;
  },
  set: (v: number | null) => {
    if (entry.value) {
      entry.value.recursion.delayUntil = typeof v === 'number' ? v : false;
      store.markDirty();
    }
  },
});
const scanDepthModel = computed({
  get: () => {
    const v = entry.value?.strategy.scanDepth;
    return typeof v === 'number' ? v : null;
  },
  set: (v: number | null) => {
    if (entry.value) {
      entry.value.strategy.scanDepth = v === null || Number.isNaN(v) ? 'same_as_global' : v;
      store.markDirty();
    }
  },
});

/** caseSensitive/matchWholeWords 共用：跟随全局(null)/开(true)/关(false) 三态，喂给 SegmentedControl（string modelValue）。 */
const tristateOptions = computed(() => [
  { value: 'same', label: uiStore.t('worldbook.settings.sameAsGlobal') },
  { value: 'true', label: uiStore.t('common.on') },
  { value: 'false', label: uiStore.t('common.off') },
]);
function tristateModel(field: 'caseSensitive' | 'matchWholeWords') {
  return computed<string>({
    get: () => {
      const v = entry.value?.strategy[field];
      if (v === true) return 'true';
      if (v === false) return 'false';
      return 'same';
    },
    set: (v: string) => {
      if (!entry.value) return;
      entry.value.strategy[field] = v === 'same' ? null : v === 'true';
      store.markDirty();
    },
  });
}
const caseSensitiveModel = tristateModel('caseSensitive');
const matchWholeWordsModel = tristateModel('matchWholeWords');

function nullableNumberModel(field: 'sticky' | 'cooldown' | 'delay') {
  return computed({
    get: () => entry.value?.effect[field] ?? null,
    set: (v: number | null) => {
      if (entry.value) {
        entry.value.effect[field] = v === null || Number.isNaN(v) ? null : v;
        store.markDirty();
      }
    },
  });
}
const stickyModel = nullableNumberModel('sticky');
const cooldownModel = nullableNumberModel('cooldown');
const delayModel = nullableNumberModel('delay');

/** name 改动同步标签栏文字，不调用 open() 以避免逐字触发 sidebar scrollIntoView。 */
function onNameInput() {
  store.markDirty();
}
watch(
  () => entry.value?.name,
  (name) => {
    if (entry.value)
      tabsStore.renameTab(
        'worldbook',
        String(entry.value.uid),
        name || uiStore.t('common.unnamed')
      );
  }
);
</script>
