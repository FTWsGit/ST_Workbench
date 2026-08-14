<template>
  <div class="wb-editor-panel wb-regex-editor" v-if="field">
    <div class="wb-editor-meta">
      <span class="wb-regex-editor-name">{{ fieldLabel }}</span>
      <span class="wb-spacer"></span>
      <button
        v-if="field && store.isTabDirty('character', field.key)"
        class="wb-btn sm accent"
        :title="uiStore.t('shared.editor.saveItem')"
        @click="store.saveItem('character', field.key)"
      >
        <Icon name="save" /> {{ uiStore.t('common.save') }}
      </button>
    </div>
    <!-- depthPrompt（角色备注）独有 depth/role 两个数值/枚举字段，角色卡未接 SettingsDock，在此 meta 栏单独承载。 -->
    <div v-if="isDepthPrompt" class="wb-editor-meta">
      <label class="wb-form-label">{{ uiStore.t('character.editor.depthLabel') }}</label>
      <input type="number" class="wb-form-input wb-form-num" v-model.number="depthPromptDepth" />
      <label class="wb-form-label">{{ uiStore.t('character.editor.roleLabel') }}</label>
      <select class="wb-select-wide" v-model.number="depthPromptRole">
        <option v-for="opt in CHARACTER_DEPTH_ROLE_OPTIONS" :key="opt.value" :value="opt.value">
          {{ uiStore.t(opt.labelKey) }}
        </option>
      </select>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :jump="tabsStore.editorJump"
      :placeholder="uiStore.t('character.editor.placeholder')"
      enable-var-click
      :status-cursor-label="uiStore.t('shared.highlightedEditor.cursor')"
      :status-chars-label="uiStore.t('common.chars')"
      :status-lines-label="uiStore.t('common.lines')"
      @var-click="onVarClick"
      @var-click-miss="uiStore.hideVarPopup()"
    />
  </div>
</template>

<script setup lang="ts">
/** 角色卡虚拟字段内容编辑区：activeTab.key 为 `field:xxx` / `field:greeting:<id>` 形式的虚拟 key，
 *  非数组真实记录，解析逻辑全部在 characterStore.currentField/setCurrentFieldValue 中，本组件只管 v-model 桥接。 */
import { ref, computed, watch } from 'vue';
import { useCharacterStore } from '../../stores/characterStore';
import { useUiStore } from '../../stores/uiStore';
import { useTabsStore } from '../../stores/tabsStore';
import { CHARACTER_FIELDS, CHARACTER_DEPTH_ROLE_OPTIONS } from '../../types';
import HighlightedEditor from '../shared/HighlightedEditor.vue';
import Icon from '../shared/Icon.vue';

const store = useCharacterStore();
const uiStore = useUiStore();
const tabsStore = useTabsStore();
const editorRef = ref<InstanceType<typeof HighlightedEditor>>();

const field = computed(() => store.currentField);

const isDepthPrompt = computed(() => field.value?.key === 'field:depthPrompt');

const fieldLabel = computed(() => {
  const key = field.value?.key;
  if (!key) return '';
  if (key.startsWith('field:greeting:')) {
    const idx = store.greetingIds.indexOf(key.slice('field:greeting:'.length));
    return uiStore.t('character.sidebar.greetingLabel', { n: idx + 1 });
  }
  const found = CHARACTER_FIELDS.find((f) => 'field:' + f.key === key);
  return found ? uiStore.t(found.labelKey) : key;
});

const contentModel = computed<string>({
  get: () => field.value?.value ?? '',
  set: (v) => store.setCurrentFieldValue(v),
});

const depthPromptDepth = computed<number>({
  get: () => store.character?.otherPrompts.depthPrompt.depth ?? 4,
  set: (v) => {
    if (store.character) {
      store.character.otherPrompts.depthPrompt.depth = v;
      store.markFieldDirty('depthPrompt');
    }
  },
});
const depthPromptRole = computed<0 | 1 | 2>({
  get: () => store.character?.otherPrompts.depthPrompt.role ?? 0,
  set: (v) => {
    if (store.character) {
      store.character.otherPrompts.depthPrompt.role = v;
      store.markFieldDirty('depthPrompt');
    }
  },
});

/** 切换字段时关闭可能残留的 var-popup（避免指向旧字段的变量上下文错误）。 */
watch(
  () => tabsStore.activeTab?.key,
  () => {
    uiStore.hideVarPopup();
  },
  { immediate: true }
);

/** var-click 路由到 uiStore 的跨域 useVarNav——showVarPopup/jumpToPopupVar 都挂在那（跨域扫描+跳转）。 */
function onVarClick(payload: {
  varName: string;
  scope: 'local' | 'global';
  cursorPos: number;
  pos: { top: number; left: number };
}) {
  uiStore.showVarPopup(
    payload.varName,
    payload.scope,
    'character',
    field.value?.key ?? null,
    payload.cursorPos,
    payload.pos
  );
}

watch(
  () => [uiStore.settings.editorFontSize, uiStore.settings.editorFontFamily],
  () => {
    editorRef.value?.refreshFont();
  }
);
</script>
