import { defineStore } from 'pinia';
import { ref, computed, watch, nextTick } from 'vue';
import type {
  Preset,
  PresetSettings,
  PromptBlock,
  OrderItem,
  OrderGroup,
  OrderNode,
  RegexScript,
  Script,
} from '../types';
import * as PS from '../api/presetApi';
import type { PresetListEntry } from '../api/presetApi';
import type { LocaleKey } from '../i18n';
import * as Host from '../api/hostContext';
import { useUiStore } from './uiStore';
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList';
import { useRegexScripts } from '../composables/useRegexScripts';
import { useScriptTree } from '../composables/useScriptTree';
import { useDirtyFlag } from '../composables/useDirtyFlag';
import { useItemDirty } from '../composables/useItemDirty';
import { debounce } from '../utils';
import { useTabsStore } from './tabsStore';
import { useConfirmStore } from './confirmStore';
import { useCharacterStore } from './characterStore';
import { useWorldbookStore } from './worldbookStore';

// 类型守卫，判断 OrderNode 是否为组
export { isGroup };

const EMPTY_SETTINGS: PresetSettings = {
  openai_max_context: 4095,
  openai_max_tokens: 300,
  n: 1,
  stream_openai: true,
  temperature: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
  top_p: 1,
  repetition_penalty: 1,
  min_p: 0,
  top_k: 0,
  top_a: 0,
  seed: -1,
  squash_system_messages: false,
};

/** 跨域变量索引重建的防抖窗口：重建是全库扫描，连续输入时每键触发代价高，停顿这么久后再重扫一次。 */
const REBUILD_VARINDEX_DEBOUNCE_MS = 300;

// export 名为 usePresetStore，Pinia store id 仍为 'main'（改动会废弃已持久化的 devtools 状态）
export const usePresetStore = defineStore('main', () => {
  const tabsStore = useTabsStore();
  const confirmStore = useConfirmStore();
  const uiStore = useUiStore();
  const t: (key: string, params?: unknown) => string = (key, params) =>
    uiStore.t(key as LocaleKey, params as Record<string, string | number>);
  const showToast = uiStore.showToast;

  /* ====== Core State ======
   * rawData 是原生预设快照（保存时透传未建模字段）；settings/prompts/regexs/scripts 是干净结构。
   * prompts 是唯一真相源：数组顺序 = 视觉顺序，每条带 enabled + 分组字段（没有 prompt_order 两套数组）。 */
  const rawData = ref<Record<string, unknown> | null>(null);
  const settings = ref<PresetSettings>({ ...EMPTY_SETTINGS });
  const prompts = ref<PromptBlock[]>([]);
  const regexs = ref<RegexScript[]>([]);
  const scripts = ref<Script[]>([]);
  const order = ref<OrderNode[]>([]);
  const presetName = ref('');
  const presetList = ref<PresetListEntry[]>([]);

  /* 跨域变量重扫 watch：origin/character/worldbook 三域数据变化都重建变量索引（deep watch 捕捉字段级
   * 变异，含 content 改字）。重建本身是全库扫描，连续输入时每键触发代价高，故统一 debounce——
   * 输入停顿后才重扫一次，语义仍是"数据变了索引跟着变"，只是从每键变成停顿后一次。
   * 刻意放在 presetStore 而非 uiStore：`watch(getter, cb)` 注册时立即求值 getter，会触发 useCharacterStore()/
   * useWorldbookStore() 实例化——若放在 uiStore.setup，那两个 store 顶部 `const showToast = uiStore.showToast`
   * 会在 uiStore 尚未 return（proxy 上无任何属性）时求值，捕获 undefined，运行时报 is not a function。
   * presetStore 的 setup 触发 uiStore.setup 完成（顶 const uiStore = useUiStore()），此后才调下面两个域 store，
   * 它们顶部的 showToast/t 绑定都拿到的是已完成的 uiStore。
   * 同时必须在 order/prompts ref 声明之后：watch 注册时立即求值 getter，会访问 order.value/prompts.value。 */
  const characterStore = useCharacterStore();
  const worldbookStore = useWorldbookStore();
  const rebuildVarIndexDebounced = debounce(
    () => uiStore.rebuildVarIndex(),
    REBUILD_VARINDEX_DEBOUNCE_MS
  );
  watch(
    () => order.value,
    () => rebuildVarIndexDebounced(),
    { deep: true }
  );
  watch(
    () => prompts.value,
    () => rebuildVarIndexDebounced(),
    { deep: true }
  );
  watch(
    () => characterStore.character,
    () => rebuildVarIndexDebounced(),
    { deep: true }
  );
  watch(
    () => worldbookStore.entries,
    () => rebuildVarIndexDebounced(),
    { deep: true }
  );

  /* flatNodes 构建 + 选择态(selectedGi/anchorGi)/折叠/绑定/拆组/重排由 useGroupedList 提供。
   * 解构说明：toggleBlock/toggleGroupCollapse/reorderBlock/selectBlock/identifierToGi/revealAndFindGi
   *   原样导出；clearSelection 用于 applyLoadedPreset() 换预设时清空选中；
   * insertAfterActive/removeNode
   *   纯树操作原语，被 addBlock/deleteBlock/hideBlock/addHiddenBlock 用于处理"插入到哪/删哪"，
   *   再各自补上 prompts/tabsStore 那部分；
   * bindSelected/unbindGroup
   *   被下面同名函数包一层 toast 后重新导出（略作改名避免撞名）。 */
  const {
    selectedGi,
    anchorGi,
    flatNodes,
    identifierToGi,
    revealAndFindGi,
    clearSelection,
    selectBlock,
    toggleBlock: toggleBlockRaw,
    toggleGroupCollapse,
    reorderBlock: reorderBlockRaw,
    insertAfterActive,
    removeNode,
    bindSelected: bindSelectedNodes,
    unbindGroup: unbindGroupNode,
  } = useGroupedList(order);

  /** 活动标签驱动侧边栏高亮的单一真相源：活动 tab 切到某 block 时，展开包含它的折叠组
   *  (revealAndFindGi) 并高亮该行 (selectedGi/anchorGi)。
   *  约束：必须 key off `tabsStore.activeTab`（只在活动 tab 身份实际变化时变），而非
   *  `listScrollToken['block']`——selectBlock() 的 ctrl/shift 多选路径也会触发
   *  requestListScroll('block')，却从不改 activeId；若 key 在同一 token 上，每次 ctrl/shift
   *  点击都会把刚算好的 selectedGi 冲回单行。
   *  `flush: 'sync'`：让此 watcher 先于 useListScrollSync 由 open()/focus() 触发的
   *  requestListScroll 那条路径解析，避免同 tick race 拿到仍折叠的组而滚到空处。 */
  watch(
    () => tabsStore.activeTab,
    (tab) => {
      if (!tab || tab.domain !== 'preset') return;
      const gi = revealAndFindGi(tab.key);
      if (gi < 0) return;
      // 幂等守卫：高亮实际不变时不给侧边栏 v-for 新 Set 引用
      if (anchorGi.value === gi && selectedGi.value.size === 1 && selectedGi.value.has(gi)) return;
      selectedGi.value = new Set([gi]);
      anchorGi.value = gi;
    },
    { immediate: true, flush: 'sync' }
  );

  /* ====== Dirty flag ====== useDirtyFlag() 在 setup 最早期调用——regex/tavern 段的 useRegexScripts/useScriptTree
   *  要把 markDirty 传进 options，必须在它们声明前解构出 markDirty。结构轴（order 深 watch）与内容轴
   *  （prompts/regexs 深 watch + syncFromValues）分开接线，见下方 Dirty tracking 段。 */
  const { dirty: structuralDirty, markDirty } = useDirtyFlag();

  const blockDirty = useItemDirty<PromptBlock>(); // key = identifier
  const regexDirty = useItemDirty<RegexScript>(); // key = script.id
  const scriptDirty = useItemDirty<Script>(); // key = script.id

  /* ====== Bound Regex Scripts（干净层 regexs ref） ====== */
  function getRegexScripts(): RegexScript[] | null {
    if (!rawData.value) return null;
    return regexs.value;
  }

  const {
    addRegexScript: addRegexScriptRaw,
    deleteRegexScript: deleteRegexScriptRaw,
    reorderRegexScript,
  } = useRegexScripts(getRegexScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'preset.toast.loadFirst',
    defaultPlacement: [2],
  });

  /* ====== Regex 分组树（独立于 preset 域的 order，同 useGroupedList 模式）======
   * regexs 是干净裸数组（后端数据），regexOrder 是分组树视图。identifier 填 regex script id。
   * add/delete 直接改 regexs 裸数组（useRegexScripts），随后显式 rebuildRegexOrder 重建树——
   *   不能靠 watch([regexs], rebuild)：ref 数组原地 push/splice 不会触发引用变化，watch 不触发。
   * reorder/bind/unbind 改 regexOrder 树，随后 syncRegexScriptsFromOrder 把树展平写回裸数组
   * （更新顺序与 _gid/_gname/_gcollapsed/_genabled/_gidx 字段）。 */
  const regexOrder = ref<OrderNode[]>([]);
  const {
    flatNodes: regexFlatNodes,
    selectedGi: regexSelectedGi,
    anchorGi: regexAnchorGi,
    identifierToGi: regexIdentifierToGi,
    revealAndFindGi: regexRevealAndFindGi,
    clearSelection: regexClearSelection,
    selectBlock: regexSelectBlock,
    toggleBlock: regexToggleBlockRaw,
    toggleGroupCollapse: regexToggleGroupCollapse,
    reorderBlock: regexReorderBlockRaw,
    insertAfterActive: _regexInsertAfterActive,
    removeNode: regexRemoveNode,
    bindSelected: regexBindSelectedRaw,
    unbindGroup: regexUnbindGroupRaw,
  } = useGroupedList(regexOrder, {
    groupName: (n) => t('regex.sidebar.defaultGroupName', { count: n }),
  });

  /** add/delete 后显式 rebuild 树：useRegexScripts 改裸数组，watch 不触发原地变异。 */
  function addRegexScript(): string | null {
    const id = addRegexScriptRaw();
    if (id) {
      rebuildRegexOrder();
      regexDirty.markDirty(id);
    }
    return id;
  }
  function deleteRegexScript(id: string) {
    deleteRegexScriptRaw(id);
    rebuildRegexOrder();
    regexDirty.remove(id);
  }

  /** regex 单条开关包装：toggle 改树后 sync 回 regexs 的 script.enabled（修双状态镜像 seam——
   *  裸 toggle 只翻树 enabled 不写回真数据，保存时会把改动丢掉）。 */
  function regexToggleBlock(gi: number) {
    regexToggleBlockRaw(gi);
    syncRegexScriptsFromOrder();
    markDirty();
  }

  /** 从 regexs 裸数组重建 regexOrder 分组树——读每个 script 的 _gid/_gname/_gcollapsed/_genabled/_gidx。 */
  function rebuildRegexOrder() {
    const scriptsArr = regexs.value;
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { script: RegexScript; idx: number }[];
      }
    >();
    scriptsArr.forEach((script) => {
      if (script._gid) {
        if (!groups.has(script._gid)) {
          groups.set(script._gid, {
            name: script._gname || 'Group',
            collapsed: script._gcollapsed !== false,
            enabled: script._genabled !== false,
            items: [],
          });
        }
        groups.get(script._gid)!.items.push({ script, idx: script._gidx ?? 0 });
      }
    });
    groups.forEach((g) => g.items.sort((a, b) => a.idx - b.idx));
    const usedGroups = new Set<string>();
    const topLevel: OrderNode[] = [];
    scriptsArr.forEach((script) => {
      if (script._gid) {
        if (usedGroups.has(script._gid)) return;
        const g = groups.get(script._gid)!;
        topLevel.push({
          id: 'group_' + script._gid,
          _gid: script._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map((x) => ({
            identifier: x.script.id,
            enabled: x.script.enabled,
          })),
        } as OrderGroup);
        usedGroups.add(script._gid);
      } else {
        topLevel.push({
          identifier: script.id,
          enabled: script.enabled,
        } as OrderItem);
      }
    });
    regexOrder.value = topLevel;
  }

  /** 把 regexOrder 树展平写回 regexs 裸数组：重排 scripts 顺序 + 更新 _gid 等分组字段。 */
  function syncRegexScriptsFromOrder() {
    const scriptsArr = getRegexScripts();
    if (!scriptsArr) return;
    const byId = new Map(scriptsArr.map((s) => [s.id, s]));
    const reordered: RegexScript[] = [];
    regexOrder.value.forEach((node) => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const s = byId.get(child.identifier);
          if (!s) return;
          s.enabled = child.enabled;
          s._gid = node._gid;
          s._gname = node.name;
          s._gcollapsed = node.collapsed;
          s._genabled = node.enabled;
          s._gidx = cidx;
          reordered.push(s);
        });
      } else {
        const s = byId.get(node.identifier);
        if (!s) return;
        s.enabled = node.enabled;
        delete s._gid;
        delete s._gname;
        delete s._gcollapsed;
        delete s._genabled;
        delete s._gidx;
        reordered.push(s);
      }
    });
    regexs.value = reordered;
  }

  /** regex sidebar 拖拽重排：改 regexOrder 树后 sync 回 regexs。 */
  function reorderRegexBlock(fromGi: number, toGi: number, after: boolean) {
    regexReorderBlockRaw(fromGi, toGi, after);
    syncRegexScriptsFromOrder();
    markDirty();
  }
  /** regex sidebar 绑定：合并选中顶层 item 成新组后 sync 回 regexs。 */
  function regexBindSelected() {
    const result = regexBindSelectedRaw();
    if (!result) {
      showToast(t('preset.toast.select2PlusBlocks'));
      return;
    }
    syncRegexScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }));
  }
  /** regex sidebar 解绑：拆组成顶层 item 后 sync 回 regexs。 */
  function regexUnbindGroup(gi: number) {
    if (!regexUnbindGroupRaw(gi)) return;
    syncRegexScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.unbound'));
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）。 */
  watch(regexs, () => rebuildRegexOrder(), {
    deep: true,
    immediate: true,
  });

  /* ====== Bound Tavern Helper（干净层扁平 scripts ref）======
   * scripts 是干净扁平 Script[]（ScriptFolder 已在 api 边界折叠成组），scriptTreeOrder 是分组树视图。
   * identifier 填 script 的 id。add/delete 直接改 scripts（useScriptTree），随后显式 rebuildScriptTreeOrder。 */
  function getScripts(): Script[] | null {
    if (!rawData.value) return null;
    return scripts.value;
  }

  const {
    addScriptTree: addScriptTreeRaw,
    deleteScriptTree: deleteScriptTreeRaw,
    reorderScriptTree,
  } = useScriptTree(getScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'preset.toast.loadFirst',
    defaultPlacement: [2],
  });

  /* ====== tavern_helper 分组树（同 regex 段模式）======
   * scripts 是干净扁平数组，scriptTreeOrder 是分组树视图。identifier 填 script 的 id。
   * add/delete 直接改 scripts 裸数组（useScriptTree），随后显式 rebuildScriptTreeOrder 重建树。 */
  const scriptTreeOrder = ref<OrderNode[]>([]);
  const {
    flatNodes: scriptTreeFlatNodes,
    selectedGi: scriptTreeSelectedGi,
    anchorGi: scriptTreeAnchorGi,
    identifierToGi: scriptTreeIdentifierToGi,
    revealAndFindGi: scriptTreeRevealAndFindGi,
    clearSelection: scriptTreeClearSelection,
    selectBlock: scriptTreeSelectBlock,
    toggleBlock: scriptTreeToggleBlockRaw,
    toggleGroupCollapse: scriptTreeToggleGroupCollapse,
    reorderBlock: scriptTreeReorderBlockRaw,
    insertAfterActive: _scriptTreeInsertAfterActive,
    removeNode: scriptTreeRemoveNode,
    bindSelected: scriptTreeBindSelectedRaw,
    unbindGroup: scriptTreeUnbindGroupRaw,
  } = useGroupedList(scriptTreeOrder, {
    groupName: (n) => t('tavern.sidebar.defaultGroupName', { count: n }),
  });

  /** add/delete 后显式 rebuild 树：同 regex 段修法。 */
  function addScriptTree(): string | null {
    const id = addScriptTreeRaw();
    if (id) {
      rebuildScriptTreeOrder();
      scriptDirty.markDirty(id);
    }
    return id;
  }
  function deleteScriptTree(id: string) {
    deleteScriptTreeRaw(id);
    rebuildScriptTreeOrder();
    scriptDirty.remove(id);
  }

  /** tavern 单条开关包装：toggle 改树后 sync 回 scripts 的 script.enabled。 */
  function scriptTreeToggleBlock(gi: number) {
    scriptTreeToggleBlockRaw(gi);
    syncScriptsFromOrder();
    markDirty();
  }

  /** 从 scripts 扁平数组重建 scriptTreeOrder 分组树——读每个 Script 的 _gid/_gname/_gcollapsed/_genabled/_gidx。 */
  function rebuildScriptTreeOrder() {
    const scriptsArr = scripts.value;
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { script: Script; idx: number }[];
      }
    >();
    scriptsArr.forEach((script) => {
      if (script._gid) {
        if (!groups.has(script._gid)) {
          groups.set(script._gid, {
            name: script._gname || 'Group',
            collapsed: script._gcollapsed !== false,
            enabled: script._genabled !== false,
            items: [],
          });
        }
        groups.get(script._gid)!.items.push({ script, idx: script._gidx ?? 0 });
      }
    });
    groups.forEach((g) => g.items.sort((a, b) => a.idx - b.idx));
    const usedGroups = new Set<string>();
    const topLevel: OrderNode[] = [];
    scriptsArr.forEach((script) => {
      if (script._gid) {
        if (usedGroups.has(script._gid)) return;
        const g = groups.get(script._gid)!;
        topLevel.push({
          id: 'group_' + script._gid,
          _gid: script._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map((x) => ({
            identifier: x.script.id,
            enabled: x.script.enabled,
          })),
        } as OrderGroup);
        usedGroups.add(script._gid);
      } else {
        topLevel.push({
          identifier: script.id,
          enabled: script.enabled,
        } as OrderItem);
      }
    });
    scriptTreeOrder.value = topLevel;
  }

  /** 把 scriptTreeOrder 树展平写回 scripts 扁平数组：重排 scripts 顺序 + 更新 _gid 等分组字段。 */
  function syncScriptsFromOrder() {
    const scriptsArr = getScripts();
    if (!scriptsArr) return;
    const byId = new Map(scriptsArr.map((s) => [s.id, s]));
    const reordered: Script[] = [];
    scriptTreeOrder.value.forEach((node) => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const s = byId.get(child.identifier);
          if (!s) return;
          s.enabled = child.enabled;
          s._gid = node._gid;
          s._gname = node.name;
          s._gcollapsed = node.collapsed;
          s._genabled = node.enabled;
          s._gidx = cidx;
          reordered.push(s);
        });
      } else {
        const s = byId.get(node.identifier);
        if (!s) return;
        s.enabled = node.enabled;
        delete s._gid;
        delete s._gname;
        delete s._gcollapsed;
        delete s._genabled;
        delete s._gidx;
        reordered.push(s);
      }
    });
    scripts.value = reordered;
  }

  /** tavern sidebar 拖拽重排：改 scriptTreeOrder 树后 sync 回 scripts。 */
  function reorderScriptTreeBlock(fromGi: number, toGi: number, after: boolean) {
    scriptTreeReorderBlockRaw(fromGi, toGi, after);
    syncScriptsFromOrder();
    markDirty();
  }
  /** tavern sidebar 绑定：合并选中顶层 item 成新组后 sync 回 scripts。 */
  function scriptTreeBindSelected() {
    const result = scriptTreeBindSelectedRaw();
    if (!result) {
      showToast(t('preset.toast.select2PlusBlocks'));
      return;
    }
    syncScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }));
  }
  /** tavern sidebar 解绑：拆组成顶层 item 后 sync 回 scripts。 */
  function scriptTreeUnbindGroup(gi: number) {
    if (!scriptTreeUnbindGroupRaw(gi)) return;
    syncScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.unbound'));
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）。 */
  watch(
    scripts,
    () => {
      rebuildScriptTreeOrder();
      scriptDirty.syncFromValues(scripts.value.map((s): [string, Script] => [s.id, s]));
    },
    { deep: true, immediate: true }
  );

  /* ====== 适配器注册：让路由容器（EditorShell/SettingsDock）拿数据时不直接 import presetStore ======
   *  regex/tavern 是 host-dependent domain，数据切片由 host store 暴露。scripts 用 getter 函数：
   *  响应式追踪在 getter 调用时建立，消费方每次读都拿到最新的、已 unwrap 的数组。 */
  tabsStore.registerDomainAdapter('regex', 'preset', {
    scripts: () => regexs.value,
    workspace: 'preset',
    t: (key, params) => uiStore.t(key, params),
    isDirty: (id) => regexDirty.isDirty(id),
    saveItem: (id) => {
      saveItem('regex', id);
    },
  });
  tabsStore.registerDomainAdapter('tavern', 'preset', {
    scripts: () => scripts.value,
    workspace: 'preset',
    t: (key, params) => uiStore.t(key, params),
    isDirty: (id) => scriptDirty.isDirty(id),
    saveItem: (id) => {
      saveItem('tavern', id);
    },
  });

  /* ====== 脏标记（驱动 header Save 按钮上的 `*`） ======
   * `order` 深 watch 记结构轴脏（重排/分组/折叠/启停只改 order 树，syncFromValues 抓不到）。
   * `prompts`/`regexs` 深 watch 记内容轴脏：任何字段变异（编辑入口、agent 工具）都由
   *   syncFromValues 按基线重算 per-item 脏，无需逐入口打标。
   * 加载新预设时对 prompts/order 的赋值会触发 watch 标脏——applyLoadedPreset() 在 nextTick 里
   *   resetAll 清回（Vue 在该 nextTick 回调前 flush 掉这次赋值排入的 watcher）。 */
  watch(order, markDirty, { deep: true });
  watch(
    regexs,
    () => {
      regexDirty.syncFromValues(regexs.value.map((s): [string, RegexScript] => [s.id, s]));
    },
    { deep: true }
  );
  watch(
    prompts,
    () => {
      blockDirty.syncFromValues(prompts.value.map((p): [string, PromptBlock] => [p.identifier, p]));
    },
    { deep: true }
  );

  /* ====== Modals ====== */
  const hiddenOpen = ref(false);

  /* ====== Jump requests（跨域共享：抽到 tabsStore，preset/character/worldbook ContentEditor 都接 :jump=tabsStore.editorJump）======
   * token 递增：line/col 重复时也强制 watcher 触发。
   * `keepFocus: true`：只把匹配滚入视图，不移动 focus/selection 进编辑器——用于在搜索框内打字时
   * 预览当前匹配，而不偷走你正在打字的按键。 */
  const editorJump = computed(() => tabsStore.editorJump);
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    tabsStore.requestEditorJump(line, col, len, keepFocus);
  }

  /* ====== Computed ====== */
  const currentBlock = computed<PromptBlock | null>(() => {
    const tab = tabsStore.activeTab;
    if (!tab || tab.domain !== 'preset') return null;
    return prompts.value.find((p) => p.identifier === tab.key && !p.hidden) ?? null;
  });

  const hasData = computed(() => rawData.value !== null);

  /* ====== Preset IO ======
   * loadPresetByName() 是唯一真正的"load"原语，其余都是薄封装：
   *   - loadFromContext(): 面板首次打开时加载 ST 当前选中的预设。
   *   - switchPreset(name): 显式加载另一个预设，独立于 ST 自己的选中——真正的"预设切换器"。
   *   - refreshPresetList(): (重新)填充 presetList 供 UI 选择；首次加载自动调用。 */

  /** 从干净的 prompts 数组重建 order 分组树——读每条 PromptBlock 的 enabled + _gid 等分组字段。 */
  function importOrderWithGroups(blocks: PromptBlock[]): OrderNode[] {
    blocks = blocks.filter((b) => !b.hidden);
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { block: PromptBlock; idx: number }[];
      }
    >();
    blocks.forEach((block) => {
      if (block._gid) {
        if (!groups.has(block._gid)) {
          groups.set(block._gid, {
            name: block._gname || 'Group',
            collapsed: block._gcollapsed !== false,
            enabled: block._genabled !== false,
            items: [],
          });
        }
        groups.get(block._gid)!.items.push({ block, idx: block._gidx ?? 0 });
      }
    });
    groups.forEach((g) => g.items.sort((a, b) => a.idx - b.idx));
    const usedGroups = new Set<string>();
    const topLevel: OrderNode[] = [];
    blocks.forEach((block) => {
      if (block._gid) {
        if (usedGroups.has(block._gid)) return;
        const g = groups.get(block._gid)!;
        topLevel.push({
          id: 'group_' + block._gid,
          _gid: block._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map((x) => ({
            identifier: x.block.identifier,
            enabled: x.block.enabled,
          })),
        } as OrderGroup);
        usedGroups.add(block._gid);
      } else {
        topLevel.push({ identifier: block.identifier, enabled: block.enabled } as OrderItem);
      }
    });
    return topLevel;
  }

  /** 把 order 树展平写回 prompts：重排 prompts 数组顺序 + 更新每条 enabled/_gid 等分组字段。 */
  function exportOrder() {
    const byId = new Map(prompts.value.map((p) => [p.identifier, p]));
    const reordered: PromptBlock[] = [];
    order.value.forEach((node) => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const b = byId.get(child.identifier);
          if (!b) return;
          b.enabled = child.enabled;
          b._gid = node._gid;
          b._gname = node.name;
          b._gcollapsed = node.collapsed;
          b._genabled = node.enabled;
          b._gidx = cidx;
          reordered.push(b);
        });
      } else {
        const b = byId.get(node.identifier);
        if (!b) return;
        b.enabled = node.enabled;
        delete b._gid;
        delete b._gname;
        delete b._gcollapsed;
        delete b._genabled;
        delete b._gidx;
        reordered.push(b);
      }
    });
    // 隐藏块不在 order 树里，原样追加到末尾，避免丢数据
    for (const b of prompts.value) {
      if (b.hidden && !reordered.some((r) => r.identifier === b.identifier)) reordered.push(b);
    }
    prompts.value = reordered;
  }

  function applyLoadedPreset(preset: Preset, raw: Record<string, unknown>, name: string) {
    rawData.value = raw;
    settings.value = preset.settings;
    prompts.value = preset.prompts;
    regexs.value = preset.regexs;
    scripts.value = preset.scripts;
    order.value = importOrderWithGroups(preset.prompts);
    clearSelection();
    presetName.value = name;
    uiStore.rebuildVarIndex();
    tabsStore.closeWorkspace('preset'); // 旧标签（block、regex都算）都指向即将被替换的数据
    rebuildRegexOrder(); // load 背真数据后显式 rebuild（deep watch 的 immediate 已跑过，此处保险）
    rebuildScriptTreeOrder();
    nextTick(() => {
      structuralDirty.value = false;
      blockDirty.resetAll(prompts.value.map((p): [string, PromptBlock] => [p.identifier, p]));
      regexDirty.resetAll(regexs.value.map((s): [string, RegexScript] => [s.id, s]));
      scriptDirty.resetAll(scripts.value.map((s): [string, Script] => [s.id, s]));
    });
  }

  function refreshPresetList() {
    try {
      presetList.value = PS.listPresets();
    } catch (e: unknown) {
      showToast(t('preset.toast.listFailed', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  function loadPresetByName(name: string, opts: { silent?: boolean } = {}) {
    Host.invalidateCache();
    let r: { preset: Preset; raw: Record<string, unknown> } | null;
    try {
      r = PS.getPresetByName(name);
    } catch (e: unknown) {
      showToast(t('preset.toast.loadFailed', { msg: e instanceof Error ? e.message : String(e) }));
      return;
    }
    if (!r) {
      showToast(t('preset.toast.notFound', { name }));
      return;
    }
    applyLoadedPreset(r.preset, r.raw, name);
    if (!opts.silent) showToast(t('preset.toast.loaded', { name }));
  }

  /** 面板首次打开时加载：ST 当前选中的预设。 */
  function loadFromContext() {
    refreshPresetList();
    Host.invalidateCache();
    let name: string;
    try {
      name = PS.getSelectedPresetName();
    } catch (e: unknown) {
      showToast(
        t('preset.toast.cantLoadContext', { msg: e instanceof Error ? e.message : String(e) })
      );
      return;
    }
    if (!name) {
      showToast(t('preset.toast.noSelected'));
      return;
    }
    loadPresetByName(name);
  }

  function reloadPreset() {
    refreshPresetList();
    Host.invalidateCache();
    const name: string = presetName.value;
    if (!name) {
      showToast(t('preset.toast.noSelected'));
      return;
    }
    loadPresetByName(name);
  }

  /** 显式切换预设——加载另一个预设，独立于 ST 自己的选中。当前预设未保存的编辑会被丢弃
   *  （若这有影响，调用方/UI 应先确认）。 */
  function switchPreset(name: string) {
    if (!name || name === presetName.value) return;
    loadPresetByName(name);
  }

  async function doSavePreset() {
    if (!rawData.value) {
      showToast(t('preset.toast.noDataToSave'));
      return;
    }
    exportOrder(); // 把 order 树的顺序/分组/启用态写回 prompts
    const name = presetName.value || 'preset_modified';
    const preset: Preset = {
      name,
      settings: settings.value,
      prompts: prompts.value,
      regexs: regexs.value,
      scripts: scripts.value,
    };
    try {
      // rawData.value 是 Vue 响应式 Proxy，ST 的 savePreset 内部 structuredClone 不了它，
      // 且若 ST 先把传入对象赋进自己的 live state 再 clone，我们的 Proxy 会泄漏进 ST 内部。
      // 约束：永远交给 ST 一个纯 plain、非响应式的深拷贝。
      const native = await PS.savePresetAs(name, preset, JSON.parse(JSON.stringify(rawData.value)));
      rawData.value = native;
      presetName.value = name;
      refreshPresetList(); // 新名保存会新增条目，保持 picker 同步
      structuralDirty.value = false;
      blockDirty.resetAll(prompts.value.map((p): [string, PromptBlock] => [p.identifier, p]));
      regexDirty.resetAll(regexs.value.map((s): [string, RegexScript] => [s.id, s]));
      scriptDirty.resetAll(scripts.value.map((s): [string, Script] => [s.id, s]));
      showToast(t('preset.toast.saved', { name }));
    } catch (e: unknown) {
      showToast(t('preset.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  /** 单条 item 保存：从 raw 重建磁盘基线，只覆盖这一条的内容再整体保存，然后仅重置该条的脏。
   *  新建（isNew）的条目没有基线可覆盖，退回全量 doSavePreset()。 */
  async function saveItem(domain: string, key: string) {
    if (!rawData.value) {
      showToast(t('preset.toast.noDataToSave'));
      return;
    }
    const disk = PS.fromNativePreset(rawData.value);
    let target: Preset;
    if (domain === 'preset') {
      const cur = prompts.value.find((p) => p.identifier === key && !p.hidden);
      if (!cur) return;
      if (blockDirty.isNew(key)) {
        await doSavePreset();
        return;
      }
      target = {
        ...disk,
        prompts: disk.prompts.map((p) =>
          p.identifier === key ? { ...p, name: cur.name, content: cur.content, role: cur.role } : p
        ),
      };
    } else if (domain === 'regex') {
      const cur = regexs.value.find((s) => s.id === key);
      if (!cur) return;
      if (regexDirty.isNew(key)) {
        await doSavePreset();
        return;
      }
      target = { ...disk, regexs: disk.regexs.map((s) => (s.id === key ? cur : s)) };
    } else if (domain === 'tavern') {
      const cur = scripts.value.find((s) => s.id === key);
      if (!cur) return;
      if (scriptDirty.isNew(key)) {
        await doSavePreset();
        return;
      }
      target = { ...disk, scripts: disk.scripts.map((s) => (s.id === key ? cur : s)) };
    } else {
      return;
    }
    try {
      const native = await PS.savePresetAs(presetName.value, target, rawData.value);
      rawData.value = native;
      if (domain === 'preset') {
        const b = prompts.value.find((p) => p.identifier === key);
        if (b) blockDirty.setBaseline(key, b);
      } else if (domain === 'regex') {
        const s = regexs.value.find((x) => x.id === key);
        if (s) regexDirty.setBaseline(key, s);
      } else {
        const s = scripts.value.find((x) => x.id === key);
        if (s) scriptDirty.setBaseline(key, s);
      }
      refreshPresetList();
      showToast(t('preset.toast.saved', { name: presetName.value }));
    } catch (e) {
      showToast(t('preset.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function createPreset(name: string) {
    refreshPresetList();
    if (presetList.value.some((p) => p.name === name)) {
      showToast(t('preset.toast.duplicateName'));
      return;
    }

    const raw = JSON.parse(JSON.stringify(PS.DEFAULT_NATIVE_PRESET)) as Record<string, unknown>;
    const preset = PS.fromNativePreset(raw);
    try {
      await PS.savePresetAs(name, preset, raw);
      refreshPresetList();
      applyLoadedPreset(preset, raw, name);
      showToast(t('preset.toast.created', { name }));
    } catch (e: unknown) {
      showToast(
        t('preset.toast.createFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }
  async function removeCurrentPreset() {
    const name = presetName.value;
    if (!name) return;
    try {
      await PS.deletePreset(name);
      refreshPresetList();
      const next = presetList.value[0]?.name;
      if (next) loadPresetByName(next, { silent: true });
      else {
        rawData.value = null;
        presetName.value = '';
      }
      showToast(t('preset.toast.deleted', { name }));
    } catch (e: unknown) {
      showToast(
        t('preset.toast.deleteFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /* ====== Block Ops ======
   * selectBlock/toggleGroupCollapse 是 useGroupedList() 返回的纯树操作，原样导出。
   * toggleBlock/reorderBlock 包一层 exportOrder()（同 Group Ops 段的 bind/unbind）：树改完必须同步回
   * prompts 数组（enabled/_gid 等字段），blockDirty 的 deep watch + syncFromValues 才能抓到 per-item 变更。
   * addBlock/deleteBlock/hideBlock/addHiddenBlock 留在这里，因为它们要触碰 useGroupedList
   * 故意不碰的东西：`prompts`（后端数据数组）、tabsStore（开/关标签）、confirmStore（删除确认）。 */
  /** block 单条开关：翻 order 树后写回 prompts，让该 block 的 per-item dirty 生效。 */
  function toggleBlock(gi: number) {
    toggleBlockRaw(gi);
    exportOrder();
  }
  /** block 拖拽重排：改 order 树后写回 prompts（数组顺序 = 视觉顺序）。 */
  function reorderBlock(fromGi: number, toGi: number, after: boolean) {
    reorderBlockRaw(fromGi, toGi, after);
    exportOrder();
  }
  function addBlock() {
    if (!rawData.value) {
      showToast(t('preset.toast.loadFirst'));
      return;
    }
    const id = 'custom_' + Date.now();
    prompts.value.push({
      identifier: id,
      name: 'New Block',
      role: 'system',
      content: '',
      system_prompt: false,
      marker: false,
      enabled: true,
      injectionPosition: 0,
      injectionDepth: 0,
      injectionOrder: 0,
    });
    const activeId = tabsStore.activeTab?.domain === 'preset' ? tabsStore.activeTab.key : null;
    insertAfterActive({ identifier: id, enabled: true }, activeId);
    // 直接打开新块的标签——编辑器内容由标签驱动
    tabsStore.open({
      domain: 'preset',
      key: id,
      label: 'New Block',
      workspace: 'preset',
    });
    showToast(t('preset.toast.blockCreated'));
  }
  function deleteBlock(gi: number) {
    const node = flatNodes.value[gi];
    if (!node) return;
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier;
      const block = prompts.value.find((p) => p.identifier === id);
      if (block?.marker) {
        showToast(t('preset.toast.cannotDeleteMarker'));
        return;
      }
    }
    const name = node.isGroup
      ? (node.ref as OrderGroup).name || t('common.unnamed')
      : prompts.value.find((p) => p.identifier === (node.ref as OrderItem).identifier)?.name ||
        t('common.new');
    const wasGroup = node.isGroup;
    confirmStore.ask({
      title: t('preset.confirm.deleteBlock.title'),
      message: t('preset.confirm.deleteBlock.message', { name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const removed = removeNode(gi);
        if (!removed) return;
        // 组：只关子块标签，不删 prompts 数据（子块变为"隐藏块"，仍可从隐藏块列表找回）。
        // 叶子块：关自己标签 + 真删数据行。
        for (const id of removed.identifiers) tabsStore.close('preset', id);
        if (!wasGroup) {
          const pi = prompts.value.findIndex((p) => p.identifier === removed.identifiers[0]);
          if (pi >= 0) prompts.value.splice(pi, 1);
          blockDirty.remove(removed.identifiers[0]);
        } else {
          for (const id of removed.identifiers) {
            const b = prompts.value.find((p) => p.identifier === id);
            if (b) {
              b.hidden = true;
              delete b._gid;
              delete b._gname;
              delete b._gcollapsed;
              delete b._genabled;
              delete b._gidx;
            }
          }
        }
        uiStore.rebuildVarIndex();
        showToast(t('preset.toast.blockDeleted'));
      },
    });
  }
  function hideBlock(gi: number) {
    const node = flatNodes.value[gi];
    if (!node) return;
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier;
      const block = prompts.value.find((p) => p.identifier === id);
      if (block?.marker) {
        showToast(t('preset.toast.cannotHideMarker'));
        return;
      }
    }
    const wasGroup = node.isGroup;
    const removed = removeNode(gi);
    if (!removed) return;
    // 隐藏组：把整个组（含子块）从 order 摘掉，子块移入隐藏块列表，不关子块标签。
    // 隐藏单个叶子块时才关它自己的标签。
    for (const id of removed.identifiers) {
      const b = prompts.value.find((p) => p.identifier === id);
      if (b) {
        b.hidden = true;
        delete b._gid;
        delete b._gname;
        delete b._gcollapsed;
        delete b._genabled;
        delete b._gidx;
      }
    }
    if (!wasGroup) tabsStore.close('preset', removed.identifiers[0]);
    showToast(t('preset.toast.blockHidden'));
  }
  function addHiddenBlock(identifier: string) {
    const b = prompts.value.find((p) => p.identifier === identifier && p.hidden);
    if (!b) return;
    b.hidden = false;
    b.enabled = true;
    const activeId = tabsStore.activeTab?.domain === 'preset' ? tabsStore.activeTab.key : null;
    insertAfterActive({ identifier, enabled: true }, activeId);
    // 打开新加块的标签
    tabsStore.open({
      domain: 'preset',
      key: identifier,
      label: b.name || identifier,
      workspace: 'preset',
    });
    showToast(t('preset.toast.blockAdded'));
  }

  /* ====== Group Ops ======
   * useGroupedList() 的 bindSelected()/unbindGroup() 外包一层 toast + exportOrder() 同步回 prompts
   *（分组字段 _gid/_gidx 等存在 prompts 数组上，树改完必须写回，blockDirty 才能抓到 per-item 变更）。 */
  function bindSelected() {
    const result = bindSelectedNodes();
    if (!result) {
      showToast(t('preset.toast.select2PlusBlocks'));
      return;
    }
    exportOrder();
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }));
  }
  function unbindGroup(gi: number) {
    if (!unbindGroupNode(gi)) return;
    exportOrder();
    showToast(t('preset.toast.unbound'));
  }

  /* ====== Search（工具箱通用版） ====== */
  /** 工具箱 Search 的通用"跳到命中"出口：按 itemId 定位（预设块 identifier 或正则脚本 id），
   *  开对应标签；content 文本命中再叠加编辑器跳转。 */
  function jumpToFieldHit(
    itemId: string,
    fieldKey: string,
    line: number,
    col: number,
    len: number
  ) {
    const script = getRegexScripts()?.find((r) => r.id === itemId);
    if (script) {
      tabsStore.open({
        domain: 'regex',
        key: script.id,
        label: script.scriptName || script.id,
        workspace: 'preset',
      });
      return;
    }
    const thNode = getScripts()?.find((s) => s.id === itemId);
    if (thNode) {
      tabsStore.open({
        domain: 'tavern',
        key: thNode.id,
        label: thNode.name || thNode.id,
        workspace: 'preset',
      });
      const gi = scriptTreeIdentifierToGi(thNode.id);
      if (gi >= 0) scriptTreeRevealAndFindGi(thNode.id);
      return;
    }
    const block = prompts.value.find((p) => p.identifier === itemId);
    if (!block) return;
    tabsStore.open({
      domain: 'preset',
      key: block.identifier,
      label: block.name || block.identifier,
      workspace: 'preset',
    });
    // 只有 content 文本命中才有编辑器坐标；name/role/identifier 等字段只开标签不跳光标
    if (fieldKey === 'content' && line >= 0) requestEditorJump(line, col, len, false);
  }

  /* ====== Preview 生成前的 ST 主菜单对齐 ====== */
  /** 调用 ST 的主菜单选择预设（不是加载到编辑器），仅在 ST 当前选中不同时执行。 */
  function selectPresetByName(name: string) {
    if (!name || PS.getSelectedPresetName() === name) return;
    if (!PS.selectPresetByName(name)) showToast(t('preset.toast.selectPresetFailed'));
  }

  /* ====== Per-item dirty ======
   * structuralDirty 追踪结构变更（增删/分组/重排/启停，仍走 markDirty()），三个 useItemDirty
   * tracker 按 id 追踪各条内容的脏状态。`dirty` 聚合两者供 header Save 按钮的 `*` 使用。 */
  const dirty = computed(
    () =>
      structuralDirty.value ||
      blockDirty.anyDirty.value ||
      regexDirty.anyDirty.value ||
      scriptDirty.anyDirty.value
  );

  function isBlockDirty(id: string): boolean {
    return blockDirty.isDirty(id);
  }
  function isGroupDirty(gi: number): boolean {
    const node = flatNodes.value[gi];
    if (!node || !node.isGroup) return false;
    return (node.ref as OrderGroup).children.some((c) => isBlockDirty(c.identifier));
  }
  function isTabDirty(domain: string, key: string): boolean {
    if (domain === 'preset') return blockDirty.isDirty(key);
    if (domain === 'regex') return regexDirty.isDirty(key);
    if (domain === 'tavern') return scriptDirty.isDirty(key);
    return false;
  }
  function discardTab(domain: string, key: string): void {
    if (domain === 'preset') {
      const baseline = blockDirty.discard(key);
      const i = prompts.value.findIndex((p) => p.identifier === key);
      if (baseline === undefined) {
        // isNew：真删除
        const gi = revealAndFindGi(key);
        if (gi >= 0) removeNode(gi);
        if (i >= 0) prompts.value.splice(i, 1);
      } else if (i >= 0) {
        prompts.value.splice(i, 1, baseline);
      }
      uiStore.rebuildVarIndex();
    } else if (domain === 'regex') {
      const baseline = regexDirty.discard(key);
      const i = regexs.value.findIndex((s) => s.id === key);
      if (baseline === undefined) {
        if (i >= 0) regexs.value.splice(i, 1);
      } else if (i >= 0) {
        regexs.value.splice(i, 1, baseline);
      }
      rebuildRegexOrder();
    } else if (domain === 'tavern') {
      const baseline = scriptDirty.discard(key);
      const i = scripts.value.findIndex((s) => s.id === key);
      if (baseline === undefined) {
        if (i >= 0) scripts.value.splice(i, 1);
      } else if (i >= 0) {
        scripts.value.splice(i, 1, baseline);
      }
      rebuildScriptTreeOrder();
    }
  }

  return {
    rawData,
    settings,
    prompts,
    order,
    presetName,
    presetList,
    flatNodes,
    selectedGi,
    anchorGi,
    identifierToGi,
    revealAndFindGi,
    regexs,
    addRegexScript,
    deleteRegexScript,
    reorderRegexScript,
    regexOrder,
    regexFlatNodes,
    regexSelectedGi,
    regexAnchorGi,
    regexIdentifierToGi,
    regexRevealAndFindGi,
    regexClearSelection,
    regexSelectBlock,
    regexToggleBlock,
    regexToggleGroupCollapse,
    reorderRegexBlock,
    regexBindSelected,
    regexUnbindGroup,
    regexRemoveNode,
    rebuildRegexOrder,
    syncRegexScriptsFromOrder,
    scripts,
    getScripts,
    addScriptTree,
    deleteScriptTree,
    reorderScriptTree,
    scriptTreeOrder,
    scriptTreeFlatNodes,
    scriptTreeSelectedGi,
    scriptTreeAnchorGi,
    scriptTreeIdentifierToGi,
    scriptTreeRevealAndFindGi,
    scriptTreeClearSelection,
    scriptTreeSelectBlock,
    scriptTreeToggleBlock,
    scriptTreeToggleGroupCollapse,
    reorderScriptTreeBlock,
    scriptTreeBindSelected,
    scriptTreeUnbindGroup,
    scriptTreeRemoveNode,
    rebuildScriptTreeOrder,
    syncScriptsFromOrder,
    hiddenOpen,
    dirty,
    markDirty,
    isBlockDirty,
    isGroupDirty,
    isTabDirty,
    discardTab,
    currentBlock,
    hasData,
    editorJump,
    requestEditorJump,
    loadFromContext,
    doSavePreset,
    saveItem,
    refreshPresetList,
    switchPreset,
    createPreset,
    removeCurrentPreset,
    reloadPreset,
    selectBlock,
    addBlock,
    deleteBlock,
    hideBlock,
    addHiddenBlock,
    toggleBlock,
    reorderBlock,
    bindSelected,
    unbindGroup,
    toggleGroupCollapse,
    jumpToFieldHit,
    selectPresetByName,
  };
});
