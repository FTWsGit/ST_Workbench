import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Settings, VarOp } from '../types';
import { DEFAULT_SETTINGS, FONT_OPTIONS, CHARACTER_FIELDS } from '../types';
import { useI18n } from '../composables/useI18n';
import type { LocaleKey } from '../i18n';
import { useVarNav } from '../composables/useVarNav';
import { usePreviewEngine } from '../composables/usePreviewEngine';
import { useTabsStore } from './tabsStore';
import { usePresetStore } from './presetStore';
import { useCharacterStore } from './characterStore';
import { useWorldbookStore } from './worldbookStore';

/**
 * 全局 UI 状态单例。拥有：
 *   - settings（字体/颜色/面板宽度/语言/FAB 位置）
 *   - toast 通知
 *   - i18n t() 函数
 *   - settings 弹窗开关（全局 —— settings 不是按 domain 分的）
 *   - 主面板开关（整个 ST_Workbench 浮动面板）
 */
export const useUiStore = defineStore('ui', () => {
  const settings = ref<Settings>(loadSettings());

  const cssVars = computed(() => {
    const fm = FONT_OPTIONS.find((f) => f.name === settings.value.editorFontFamily);
    return {
      '--wb-fs': settings.value.editorFontSize + 'px',
      '--wb-ff': fm ? fm.value : FONT_OPTIONS[0].value,
      ...Object.fromEntries(
        Object.entries(settings.value.syntaxColors).map(([k, v]) => ['--' + k, v])
      ),
    };
  });

  // 主面板开关 —— 整个 ST_Workbench 浮动面板。全局，不按 domain 分。
  const panelOpen = ref(false);

  // Settings 弹窗开关 —— 全局，不按 domain 分。
  const settingsOpen = ref(false);

  // MetaPanel 打开状态 —— 横跨 preset/character 两个工作区，不属于某个 domain store。
  const metaPanelOpen = ref(false);

  // Agent 面板打开状态 —— 跨 store 运维助手，跟 activeWorkspace 无关。
  const agentPanelOpen = ref(false);

  // Var Nav / Preview 面板打开状态 —— 跨域工具（preset/character/worldbook 都能用），跟 activeWorkspace 无关。
  const varNavOpen = ref(false);
  const previewOpen = ref(false);

  // SettingsDock 右侧面板开关 —— 全局，不按 workspace 分。
  const settingsDockOpen = ref(true);
  function toggleSettingsDock() {
    settingsDockOpen.value = !settingsDockOpen.value;
  }

  function loadSettings(): Settings {
    try {
      const s = localStorage.getItem('st-wb-settings');
      if (s) {
        const p = JSON.parse(s);
        // 迁移旧布尔形态字段（v1 previewFloat/toolBoxFloat）→ PanelMode 枚举：
        // previewFloat:true=overlay,false=docked；toolBoxFloat:true=float,false=docked。
        if (p.previewMode === undefined && typeof p.previewFloat === 'boolean') {
          p.previewMode = p.previewFloat ? 'overlay' : 'docked';
        }
        if (p.toolBoxMode === undefined && typeof p.toolBoxFloat === 'boolean') {
          p.toolBoxMode = p.toolBoxFloat ? 'float' : 'docked';
        }
        return {
          ...DEFAULT_SETTINGS,
          ...p,
          syntaxColors: {
            ...DEFAULT_SETTINGS.syntaxColors,
            ...(p.syntaxColors || {}),
          },
        };
      }
    } catch {
      // JSON 解析失败（损坏/旧格式）时静默回退到默认设置
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  function saveSettings() {
    localStorage.setItem('st-wb-settings', JSON.stringify(settings.value));
  }

  // useI18n 读取此 store 持有的同一个 `settings` ref —— language 只是另一个 Settings 字段，
  // 通过 loadSettings/saveSettings 路径读写，不是第二个真相来源。
  const { t, currentLocale } = useI18n(settings);

  function resetSettings() {
    settings.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
    showToast(t('shared.toast.settingsReset'));
  }

  const toastMsg = ref('');
  const toastVisible = ref(false);
  let toastTimer: ReturnType<typeof setTimeout>;
  function showToast(msg: string, ms = 2500) {
    toastMsg.value = msg;
    toastVisible.value = true;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastVisible.value = false;
    }, ms);
  }

  /* ====== Var Nav（变量追踪）+ Preview（精确预览）======
   * 跨域工具的状态机宿主：从 presetStore 迁出，跟 agentPanelOpen 一样跨 workspace 全局。
   * 三域 store 与 tabsStore 全部惰性 use（放在 getter/回调里，不在 setup 顶层直接取）——
   * uiStore 是各 domain store 的上游（它们 setup 里拿 t/showToast），顶层互相 use 会形成初始化环。 */
  const tabsStore = useTabsStore();

  /** 跨域跳转：按 VarOp.source.domain 分派到对应 store 的 jumpToFieldHit，editorJump 共享在 tabsStore。 */
  function jumpAcrossDomain(v: VarOp) {
    if (v.source.domain === 'preset') {
      const presetStore = usePresetStore();
      const block = presetStore.prompts.find((p) => p.identifier === v.source.blockId);
      tabsStore.setActiveWorkspace('preset');
      tabsStore.open({
        domain: 'preset',
        key: v.source.blockId,
        label: block?.name || v.source.blockLabel,
        workspace: 'preset',
      });
      tabsStore.requestEditorJump(v.source.line, v.source.col, v.varName.length);
      return;
    }
    if (v.source.domain === 'character') {
      tabsStore.setActiveWorkspace('character');
      useCharacterStore().jumpToFieldHit(
        v.source.blockId,
        v.source.fieldName || '',
        v.source.line,
        v.source.col,
        v.varName.length
      );
      tabsStore.requestEditorJump(v.source.line, v.source.col, v.varName.length);
      return;
    }
    tabsStore.setActiveWorkspace('worldbook');
    useWorldbookStore().jumpToFieldHit(
      v.source.blockId,
      'content',
      v.source.line,
      v.source.col,
      v.varName.length
    );
    tabsStore.requestEditorJump(v.source.line, v.source.col, v.varName.length);
  }

  const {
    varFilterQ,
    localRefs,
    globalRefs,
    localFiltered,
    globalFiltered,
    varIdx,
    rebuildVarIndex,
    filterVarNav,
    jumpToVarOp,
    navVar,
    varPopupOpen,
    varPopupVarName,
    varPopupScope,
    varPopupOps,
    varPopupIdx,
    varPopupPos,
    showVarPopup,
    hideVarPopup,
    jumpToPopupVar,
    navPopupVar,
  } = useVarNav(
    {
      preset: {
        order: () => usePresetStore().order,
        prompts: () => usePresetStore().prompts,
        presetName: () => usePresetStore().presetName,
      },
      character: {
        character: () => useCharacterStore().character,
        greetingIds: () => useCharacterStore().greetingIds,
        greetingKey: (id) => 'field:greeting:' + id,
        fieldOrder: CHARACTER_FIELDS.map((f) => ({
          field: f.key,
          labelKey: f.labelKey,
        })),
      },
      worldbook: {
        order: () => useWorldbookStore().order,
        entries: () => useWorldbookStore().entries,
        worldbookName: () => useWorldbookStore().worldbookName,
      },
    },
    { onJump: jumpAcrossDomain }
  );
  /* 自动重扫：order 深 watch 捕获 block 增删/启用切换/重排序；prompts 浅 watch 兜底（content 改字不触发，避打字卡顿）；
   * character/worldbook 域数据变化各自 deep watch 触发（跨域扫描器读的是三域当前数据）。 */
  watch(
    () => usePresetStore().order,
    () => rebuildVarIndex(),
    { deep: true }
  );
  watch(
    () => usePresetStore().prompts,
    () => rebuildVarIndex()
  );
  watch(
    () => useCharacterStore().character,
    () => rebuildVarIndex(),
    { deep: true }
  );
  watch(
    () => useWorldbookStore().entries,
    () => rebuildVarIndex(),
    { deep: true }
  );

  const {
    previewMode,
    previewLoading,
    previewError,
    previewCollapsed,
    previewBlockGroups,
    previewRawText,
    generatePreviewBlocks,
    generatePreviewRaw,
    togglePreviewBlock,
    toggleAllPreviewBlocks,
  } = usePreviewEngine(
    () => usePresetStore().order,
    () => usePresetStore().prompts,
    {
      showToast,
      t: (key: string, params?: Record<string, string | number>) => t(key as LocaleKey, params),
    }
  );

  return {
    settings,
    cssVars,
    panelOpen,
    settingsOpen,
    metaPanelOpen,
    agentPanelOpen,
    varNavOpen,
    previewOpen,
    settingsDockOpen,
    toggleSettingsDock,
    loadSettings,
    saveSettings,
    resetSettings,
    toastMsg,
    toastVisible,
    showToast,
    t,
    currentLocale,
    varFilterQ,
    localRefs,
    globalRefs,
    localFiltered,
    globalFiltered,
    varIdx,
    rebuildVarIndex,
    filterVarNav,
    jumpToVarOp,
    navVar,
    varPopupOpen,
    varPopupVarName,
    varPopupScope,
    varPopupOps,
    varPopupIdx,
    varPopupPos,
    showVarPopup,
    hideVarPopup,
    jumpToPopupVar,
    navPopupVar,
    previewMode,
    previewLoading,
    previewError,
    previewCollapsed,
    previewBlockGroups,
    previewRawText,
    generatePreviewBlocks,
    generatePreviewRaw,
    togglePreviewBlock,
    toggleAllPreviewBlocks,
  };
});
