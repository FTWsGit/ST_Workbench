<template>
  <div class="wb-editor-panel wb-regex-editor" v-if="entry">
    <div class="wb-editor-meta">
      <span class="wb-regex-editor-name">{{ entry.name || uiStore.t('common.unnamed') }}</span>
      <span class="wb-spacer"></span>
      <button
        v-if="entry && store.isEntryDirty(String(entry.uid))"
        class="wb-btn sm accent"
        :title="uiStore.t('shared.editor.saveItem')"
        @click="store.saveItem('worldbook', String(entry.uid))"
      >
        <Icon name="save" /> {{ uiStore.t('common.save') }}
      </button>
      <button
        class="wb-btn sm"
        :class="{ active: uiStore.settingsDockOpen }"
        @click="uiStore.toggleSettingsDock()"
        :title="uiStore.t('regex.editor.settingsPanel')"
      >
        <Icon name="gear" />
      </button>
    </div>

    <HighlightedEditor
      ref="editorRef"
      v-model="contentModel"
      :jump="tabsStore.editorJump"
      :placeholder="uiStore.t('worldbook.editor.placeholder')"
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
/** 世界书内容编辑器：条目内容为纯文本（无正则测试栏/HTML 预览）。不参数化，直接 useWorldbookStore()。 */
import { ref, computed, watch } from 'vue';
import { useWorldbookStore } from '../../stores/worldbookStore';
import { useUiStore } from '../../stores/uiStore';
import { useTabsStore } from '../../stores/tabsStore';
import HighlightedEditor from '../shared/HighlightedEditor.vue';
import Icon from '../shared/Icon.vue';

const store = useWorldbookStore();
const uiStore = useUiStore();
const tabsStore = useTabsStore();
const editorRef = ref<InstanceType<typeof HighlightedEditor>>();

const entry = computed(() => store.currentEntry);

/** entry.content 的 v-model 桥接；字段变异由 worldbookStore 的 entries 深 watch 自动标脏。 */
const contentModel = computed<string>({
  get: () => entry.value?.content ?? '',
  set: (v) => {
    if (entry.value) {
      entry.value.content = v;
    }
  },
});

/** 切换条目时关闭可能残留的 var-popup（避免指向旧 entry 的变量上下文错误）。 */
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
    'worldbook',
    entry.value ? String(entry.value.uid) : null,
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
