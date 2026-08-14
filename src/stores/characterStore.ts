import { defineStore } from 'pinia';
import { ref, computed, nextTick, watch } from 'vue';
import {
  type Character,
  type CharacterListEntry,
  type RegexScript,
  type OrderNode,
  type OrderGroup,
  type OrderItem,
  type Script,
  CHARACTER_FIELDS,
} from '../types';
import * as CH from '../api/characterApi';
import { useTabsStore } from './tabsStore';
import { useConfirmStore } from './confirmStore';
import { useUiStore } from './uiStore';
import { useRegexScripts } from '../composables/useRegexScripts';
import { useScriptTree } from '../composables/useScriptTree';
import { useDirtyFlag } from '../composables/useDirtyFlag';
import { useItemDirty } from '../composables/useItemDirty';
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList';
import type { LocaleKey } from '../i18n';
function genLocalId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function genGreetingId(): string {
  return genLocalId('g_');
}

function reorderArray<T>(arr: T[], fromIdx: number, toIdx: number, after: boolean) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return;
  const item = arr.splice(fromIdx, 1)[0];
  const insertIdx = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : after ? toIdx + 1 : toIdx;
  arr.splice(insertIdx, 0, item);
}

function emptyCharacter(name: string): Character {
  return {
    avatar: '',
    name,
    description: '',
    otherPrompts: {
      scenario: '',
      mesExample: '',
      personality: '',
      systemPrompt: '',
      postHistoryInstructions: '',
      depthPrompt: { prompt: '', depth: 4, role: 0 },
    },
    greetings: [''],
    creatorMeta: { creator: '', creatorNotes: '', version: '', tags: [] },
    talkativeness: 0.5,
    fav: false,
    worldbook: null,
    regexs: [],
    scripts: [],
  };
}

/** CHARACTER_FIELDS 里映射到 otherPrompts 的"文本字段"子集（description 在顶层、depthPrompt 是对象，单独处理）。 */
type OtherPromptTextKey = Exclude<keyof Character['otherPrompts'], 'depthPrompt'>;

/** 字段基线的值类型：普通文本字段是 string，depthPrompt 是整个复合对象。 */
type FieldBaseline = string | { prompt: string; depth: number; role: 0 | 1 | 2 };

/** 按 CHARACTER_FIELDS key 从 Character 取虚拟字段的值：description 读顶层，depthPrompt 读
 *  otherPrompts.depthPrompt.prompt，其余读 otherPrompts[key]。非字段 key 返回 null。 */
function getFieldValue(char: Character, key: string): string | null {
  if (key === 'description') return char.description;
  if (key === 'depthPrompt') return char.otherPrompts.depthPrompt.prompt;
  if (!CHARACTER_FIELDS.some((f) => f.key === key)) return null;
  return char.otherPrompts[key as OtherPromptTextKey];
}

/** 与 getFieldValue 对称的写入。返回是否写入成功（非法字段 key 返回 false）。 */
function setFieldValue(char: Character, key: string, value: string): boolean {
  if (key === 'description') {
    char.description = value;
    return true;
  }
  if (key === 'depthPrompt') {
    char.otherPrompts.depthPrompt.prompt = value;
    return true;
  }
  if (!CHARACTER_FIELDS.some((f) => f.key === key)) return false;
  char.otherPrompts[key as OtherPromptTextKey] = value;
  return true;
}

/** 取字段的完整基线值（depthPrompt 返回整个对象，description 读顶层，其余读 otherPrompts）。 */
function fieldSnapshot(char: Character, key: string): FieldBaseline {
  if (key === 'description') return char.description;
  if (key === 'depthPrompt') return char.otherPrompts.depthPrompt;
  if (!CHARACTER_FIELDS.some((f) => f.key === key)) return '';
  return char.otherPrompts[key as OtherPromptTextKey];
}

/** 独立文档 store：角色卡工作区。跟 worldbook 的区别：
 *   - 没有 flatNodes/分组 —— 固定字段列表来自 CHARACTER_FIELDS 常量。
 *   - greetings 拖拽使用合成 id 做 tab 寻址，不直接用数组下标。 */
export const useCharacterStore = defineStore('character', () => {
  const tabsStore = useTabsStore();
  const confirmStore = useConfirmStore();
  const uiStore = useUiStore();
  const t: (key: string, params?: unknown) => string = (key, params) =>
    uiStore.t(key as LocaleKey, params as Record<string, string | number>);
  const showToast = uiStore.showToast;

  /* ====== Core State ====== */
  const character = ref<Character | null>(null);
  /** 最近一次从 ST 读到的原始 v1CharData（characterApi.getCharacterByAvatar 返回的 `raw`），
   *  保存时字段级回退用（见 characterApi.ts buildFormData 的 doc comment）。新建、还没保存过的
   *  角色是 `null`——doSaveCharacter() 靠这个字段本身是否为 null 判断该调 create 还是 edit。 */
  const oldRaw = ref<unknown>(null);
  const characterList = ref<CharacterListEntry[]>([]);
  /** 用户在 CharacterMetaForm 里选好、还没提交保存的新头像文件——暂存在这里而不是直接塞进
   *  Character 接口（头像内容不适合放进一个纯数据接口里跟着深拷贝/序列化走一遍），
   *  doSaveCharacter() 保存成功后清空。 */
  const pendingAvatarFile = ref<File | Blob | null>(null);

  const { dirty: structuralDirty, markDirty } = useDirtyFlag();

  const fieldDirty = useItemDirty<FieldBaseline>(); // key = CHARACTER_FIELDS key（7 个）
  const greetingDirty = useItemDirty<string>(); // key = greetingIds 的合成 id
  const regexDirty = useItemDirty<RegexScript>(); // key = script.id
  const scriptDirty = useItemDirty<Script>(); // key = script.id

  const hasData = computed(() => character.value !== null);

  const dirty = computed(
    () =>
      structuralDirty.value ||
      fieldDirty.anyDirty.value ||
      greetingDirty.anyDirty.value ||
      regexDirty.anyDirty.value ||
      scriptDirty.anyDirty.value
  );

  function markFieldDirty(fieldKey: string) {
    fieldDirty.markDirty(fieldKey);
  }
  function markGreetingDirty(gid: string) {
    greetingDirty.markDirty(gid);
  }

  /* ====== greetings 的合成 id ====== */
  const greetingIds = ref<string[]>([]);

  /* ====== 虚拟字段路由：EditorShell.vue 只需要 activeTab.key 就能拿到/改当前字段的值，
   * 不用自己解析 `field:xxx` / `field:greeting:<id>` 这套 key 格式——解析逻辑集中在这里一处，
   * 跟 worldbookStore.currentEntry 是同一个"店内路由，组件不用懂 key 是怎么编的"的思路。 */
  const currentField = computed<{ key: string; value: string } | null>(() => {
    const tab = tabsStore.activeTab;
    if (!tab || tab.domain !== 'character' || !character.value) return null;
    const key = tab.key;
    if (key.startsWith('field:greeting:')) {
      const idx = greetingIds.value.indexOf(key.slice('field:greeting:'.length));
      return idx < 0 ? null : { key, value: character.value.greetings[idx] ?? '' };
    }
    const fieldKey = key.slice('field:'.length);
    const v = getFieldValue(character.value, fieldKey);
    return v === null ? null : { key, value: v };
  });

  function setCurrentFieldValue(value: string) {
    const tab = tabsStore.activeTab;
    if (!tab || tab.domain !== 'character' || !character.value) return;
    const key = tab.key;
    if (key.startsWith('field:greeting:')) {
      const gid = key.slice('field:greeting:'.length);
      const idx = greetingIds.value.indexOf(gid);
      if (idx >= 0) {
        character.value.greetings[idx] = value;
        greetingDirty.markDirty(gid);
      }
    } else {
      const fieldKey = key.slice('field:'.length);
      if (!setFieldValue(character.value, fieldKey, value)) return;
      fieldDirty.markDirty(fieldKey);
    }
  }

  /** 工具箱 Search 的通用"跳到命中"出口：itemId 就是虚拟字段 tab key（'field:xxx' / 'field:greeting:<id>'），
   *  直接开对应标签。character 没有 groupedList，无需 revealAndFindGi。 */
  function jumpToFieldHit(
    itemId: string,
    _fieldKey: string,
    _line: number,
    _col: number,
    _len: number
  ) {
    if (!character.value) return;
    // tavern 域：按 script id 反查，开对应标签 + 展组到该行（scriptTreeIdentifierToGi 在
    //  下文 tavern 段声明，函数调用时才解析闭包引用，TDZ 不触发）
    const thNode = scripts.value.find((s) => s.id === itemId);
    if (thNode) {
      tabsStore.open({
        domain: 'tavern',
        key: thNode.id,
        label: thNode.name || thNode.id,
        workspace: 'character',
      });
      const gi = scriptTreeIdentifierToGi(thNode.id);
      if (gi >= 0) scriptTreeRevealAndFindGi(thNode.id);
      return;
    }
    if (itemId.startsWith('field:greeting:')) {
      const gid = itemId.slice('field:greeting:'.length);
      const idx = greetingIds.value.indexOf(gid);
      tabsStore.open({
        domain: 'character',
        key: itemId,
        label: t('character.sidebar.greetingLabel', {
          n: (idx >= 0 ? idx : greetingIds.value.length) + 1,
        }),
        workspace: 'character',
      });
      return;
    }
    const fieldKeyPart = itemId.slice('field:'.length);
    const field = CHARACTER_FIELDS.find((f) => f.key === fieldKeyPart);
    tabsStore.open({
      domain: 'character',
      key: itemId,
      label: field ? t(field.labelKey) : fieldKeyPart,
      workspace: 'character',
    });
  }

  /* ====== Bound Regex Scripts（同 presetStore.regexs 的模式，宿主换成 character） ====== */
  const regexs = computed<RegexScript[]>(() => character.value?.regexs ?? []);

  function getRegexScripts(): RegexScript[] | null {
    return character.value ? character.value.regexs : null;
  }

  const {
    addRegexScript: addRegexScriptRaw,
    deleteRegexScript: deleteRegexScriptRaw,
    reorderRegexScript,
  } = useRegexScripts(getRegexScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'character.toast.loadFirst',
    defaultPlacement: [2],
  });

  /* ====== Regex 分组树（同 presetStore regex 段，identifier 填 regex script id）====== */
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

  /** add/delete 后显式 rebuild 树：watch([regexs], rebuild) 浅 watch 不触发原地变异
   *  （computed getter 返回同一数组引用）——不 rebuild 则 sidebar 不显示新建项/删后 stale。 */
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
    regexDirty.remove(id);
    rebuildRegexOrder();
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
    const scripts = regexs.value;
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { script: RegexScript; idx: number }[];
      }
    >();
    scripts.forEach((script) => {
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
    scripts.forEach((script) => {
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
    const scripts = getRegexScripts();
    if (!scripts) return;
    const byId = new Map(scripts.map((s) => [s.id, s]));
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
    scripts.length = 0;
    scripts.push(...reordered);
  }

  function reorderRegexBlock(fromGi: number, toGi: number, after: boolean) {
    regexReorderBlockRaw(fromGi, toGi, after);
    syncRegexScriptsFromOrder();
    markDirty();
  }
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
  function regexUnbindGroup(gi: number) {
    if (!regexUnbindGroupRaw(gi)) return;
    syncRegexScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.unbound'));
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）——
   *  浅 watch([regexs], ...) 只追踪 computed 重新求值，push/splice/改字段都不触发。 */
  watch(
    regexs,
    () => {
      rebuildRegexOrder();
      regexDirty.syncFromValues(regexs.value.map((s): [string, RegexScript] => [s.id, s]));
    },
    {
      deep: true,
      immediate: true,
    }
  );

  /* ====== Bound Tavern Helper（照 regex 段模式，宿主换成 character）====== */
  const scripts = computed<Script[]>(() => character.value?.scripts ?? []);

  function getScripts(): Script[] | null {
    return character.value ? character.value.scripts : null;
  }

  const {
    addScriptTree: addScriptTreeRaw,
    deleteScriptTree: deleteScriptTreeRaw,
    reorderScriptTree,
  } = useScriptTree(getScripts, {
    markDirty,
    showToast,
    t,
    loadFirstMessageKey: 'character.toast.loadFirst',
    defaultPlacement: [2],
  });

  /* ====== tavern 脚本分组树（同 presetStore tavern 段，identifier 填 script id）====== */
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

  /** add/delete 后显式 rebuild 树：watch([scripts], rebuild) 浅 watch 不触发原地变异——
   *  不 rebuild 则 sidebar 不显示新建项/删后 stale。 */
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
    scriptDirty.remove(id);
    rebuildScriptTreeOrder();
  }

  /** tavern 单条开关包装：toggle 改树后 sync 回 scripts 的 script.enabled（修双状态镜像 seam）。 */
  function scriptTreeToggleBlock(gi: number) {
    scriptTreeToggleBlockRaw(gi);
    syncScriptsFromOrder();
    markDirty();
  }

  /** 从 scripts 裸数组重建 scriptTreeOrder 分组树——读每个 Script 的
   *  _gid/_gname/_gcollapsed/_genabled/_gidx。 */
  function rebuildScriptTreeOrder() {
    const list = scripts.value;
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { script: Script; idx: number }[];
      }
    >();
    list.forEach((script) => {
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
    list.forEach((script) => {
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

  /** 把 scriptTreeOrder 树展平写回 scripts 裸数组：重排 scripts 顺序 + 更新 Script 的 _gid 等分组字段。 */
  function syncScriptsFromOrder() {
    const list = getScripts();
    if (!list) return;
    const byId = new Map(list.map((s) => [s.id, s]));
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
    list.length = 0;
    list.push(...reordered);
  }

  function reorderScriptTreeBlock(fromGi: number, toGi: number, after: boolean) {
    scriptTreeReorderBlockRaw(fromGi, toGi, after);
    syncScriptsFromOrder();
    markDirty();
  }
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
  function scriptTreeUnbindGroup(gi: number) {
    if (!scriptTreeUnbindGroupRaw(gi)) return;
    syncScriptsFromOrder();
    markDirty();
    showToast(t('preset.toast.unbound'));
  }

  /** deep watch 监听数组元素字段变异（settings 表单改 script.enabled 后 sidebar 联动）——
   *  浅 watch 永不触发原地变异（数组引用没变，只是内部 push/splice/改字段）。 */
  watch(
    scripts,
    () => {
      rebuildScriptTreeOrder();
      scriptDirty.syncFromValues(scripts.value.map((s): [string, Script] => [s.id, s]));
    },
    { deep: true, immediate: true }
  );

  /* ====== 适配器注册：让路由容器（EditorShell/SettingsDock）拿数据时不直接 import characterStore ======
   *  regex/tavern 是 host-dependent domain，character 域把自己的数据切片暴露给 tabsStore。
   *  scripts 用 getter 函数：响应式追踪在 getter 调用时建立，消费方每次读都拿到最新的、已 unwrap 的数组。 */
  tabsStore.registerDomainAdapter('regex', 'character', {
    scripts: () => regexs.value,
    workspace: 'character',
    t: (key, params) => uiStore.t(key as LocaleKey, params),
    isDirty: (id) => regexDirty.isDirty(id),
    saveItem: (id) => {
      saveItem('regex', id);
    },
  });
  tabsStore.registerDomainAdapter('tavern', 'character', {
    scripts: () => scripts.value,
    workspace: 'character',
    t: (key, params) => uiStore.t(key as LocaleKey, params),
    isDirty: (id) => scriptDirty.isDirty(id),
    saveItem: (id) => {
      saveItem('tavern', id);
    },
  });

  /* ====== Greetings：增删拖拽 ====== */
  function addGreeting() {
    if (!character.value) {
      showToast(t('character.toast.loadFirst'));
      return;
    }
    character.value.greetings.push('');
    const id = genGreetingId();
    greetingIds.value.push(id);
    greetingDirty.markDirty(id);
    markDirty();
    tabsStore.open({
      domain: 'character',
      key: 'field:greeting:' + id,
      label: t('character.sidebar.greetingLabel', {
        n: greetingIds.value.length,
      }),
      workspace: 'character',
    });
  }
  function deleteGreeting(id: string) {
    if (!character.value) return;
    const idx = greetingIds.value.indexOf(id);
    if (idx < 0) return;
    if (character.value.greetings.length <= 1) {
      showToast(t('character.toast.needAtLeastOneGreeting'));
      return;
    }
    confirmStore.ask({
      title: t('character.confirm.deleteGreeting.title'),
      message: t('character.confirm.deleteGreeting.message'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        character.value!.greetings.splice(idx, 1);
        greetingIds.value.splice(idx, 1);
        greetingDirty.remove(id);
        tabsStore.close('character', 'field:greeting:' + id);
        markDirty();
        showToast(t('character.toast.greetingDeleted'));
      },
    });
  }
  /** `fromIdx`/`toIdx`/`after` 是 useDragReorder<number> 报告的下标（对应 greetingIds 当前顺序），
   *  greetings 和 greetingIds 两个数组同步 splice。 */
  function reorderGreeting(fromIdx: number, toIdx: number, after: boolean) {
    if (!character.value) {
      showToast(t('character.toast.loadFirst'));
      return;
    }
    reorderArray(character.value.greetings, fromIdx, toIdx, after);
    reorderArray(greetingIds.value, fromIdx, toIdx, after);
    markDirty();
  }

  /* ====== Character IO ====== */
  function applyLoaded(c: Character, raw: unknown | null) {
    character.value = c;
    oldRaw.value = raw;
    greetingIds.value = c.greetings.map(() => genGreetingId());
    pendingAvatarFile.value = null;
    tabsStore.closeWorkspace('character');
    rebuildScriptTreeOrder(); // load 后立即重建树，避免 sidebar 先渲染旧树
    nextTick(() => {
      structuralDirty.value = false;
      fieldDirty.resetAll(
        CHARACTER_FIELDS.map((f): [string, FieldBaseline] => [f.key, fieldSnapshot(c, f.key)])
      );
      greetingDirty.resetAll(
        greetingIds.value.map((gid, i): [string, string] => [gid, c.greetings[i] ?? ''])
      );
      regexDirty.resetAll(c.regexs.map((s): [string, RegexScript] => [s.id, s]));
      scriptDirty.resetAll(c.scripts.map((s): [string, Script] => [s.id, s]));
    });
  }

  function refreshCharacterList() {
    CH.listCharacters()
      .then((list) => {
        characterList.value = list;
      })
      .catch((e: unknown) =>
        showToast(
          t('character.toast.listFailed', { msg: e instanceof Error ? e.message : String(e) })
        )
      );
  }

  async function loadCharacterByAvatar(avatar: string, opts: { silent?: boolean } = {}) {
    let result: { character: Character; raw: unknown } | null;
    try {
      result = await CH.getCharacterByAvatar(avatar);
    } catch (e: unknown) {
      showToast(
        t('character.toast.loadFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
      return;
    }
    if (!result) {
      showToast(t('character.toast.notFound', { name: avatar }));
      return;
    }
    applyLoaded(result.character, result.raw);
    if (!opts.silent) showToast(t('character.toast.loaded', { name: result.character.name }));
  }

  function switchCharacter(avatar: string) {
    if (!avatar || avatar === character.value?.avatar) return;
    loadCharacterByAvatar(avatar);
  }

  function reloadCharacter() {
    if (!character.value?.avatar) {
      showToast(t('character.toast.noneSelected'));
      return;
    }
    loadCharacterByAvatar(character.value.avatar, { silent: true });
  }

  /** 切到 character workspace 时，如果不曾加载过任何角色，仅刷新角色列表，
   *  不自动选中 ST 当前角色或列表第一项——跟 worldbook 启动不自动选一份书是同一个道理：
   *  用户多半只想新建/挑一份编辑，自动加载反而会无谓占用 ST 主菜单选中项、并触发一次网络请求。
   *  Preview 真正需要 ST 选中项对齐时，由 usePreviewEngine 在生成前惰性 select char。 */
  async function loadSelectedOrFirst() {
    if (character.value?.avatar) return;
    if (characterList.value.length === 0) await refreshCharacterList();
  }

  /** Preview 生成前惰性调用：把 ST 主菜单选中角色切到当前编辑的这张卡。
   *  跟 presetStore.selectPresetByName 是同一套"只在 Preview 生成前付一次代价"的设计——
   *  ST.generate 不认工具里编辑的是哪份角色，只认主菜单选中项。失败时只 toast 提示，不中断生成。 */
  async function selectCharacterForPreview() {
    const avatar = character.value?.avatar;
    if (!avatar) return;
    const ok = await CH.selectCharacterByAvatar(avatar).catch(() => false);
    if (!ok) showToast(t('character.toast.selectCharFailed'));
  }

  async function createNewCharacter(name: string) {
    if (characterList.value.some((c) => c.name === name)) {
      showToast(t('character.toast.duplicateName'));
      return;
    }
    try {
      const newChar = emptyCharacter(name);
      const avatar = await CH.createCharacter(newChar);
      if (!avatar) {
        showToast(t('character.toast.createFailed'));
        return;
      }
      refreshCharacterList();
      await loadCharacterByAvatar(avatar, { silent: true });
      showToast(t('character.toast.created', { name }));
    } catch (e: unknown) {
      showToast(
        t('character.toast.createFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  async function removeCurrentCharacter() {
    const avatar = character.value?.avatar;
    const name = character.value?.name || avatar || '';
    if (!avatar) {
      showToast(t('character.toast.deleteFailed'));
      return;
    }
    try {
      await CH.deleteCharacter(avatar);
      refreshCharacterList();
      const next = characterList.value[0];
      if (next) await loadCharacterByAvatar(next.avatar, { silent: true });
      else {
        character.value = null;
        oldRaw.value = null;
        greetingIds.value = [];
        pendingAvatarFile.value = null;
        tabsStore.closeWorkspace('character');
      }
      showToast(t('character.toast.deleted', { name }));
    } catch (e: unknown) {
      showToast(
        t('character.toast.deleteFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /** 用户在 CharacterMetaForm 里选好的新头像文件，暂存等保存时一并 POST。
   *  传 null 表示放弃刚换的头像（回到 ST 端原头像）。 */
  function setPendingAvatar(file: File | Blob | null) {
    pendingAvatarFile.value = file;
    if (file) markDirty();
    else {
      // 放弃换头：只在原本就脏时清 dirty 才安全——但 dirty 可能由其它字段引起，
      // 这里不动 dirty，让用户自己判断要不要保存。
    }
  }

  async function doSaveCharacter() {
    if (!character.value) {
      showToast(t('character.toast.noDataToSave'));
      return;
    }
    const isNew = !oldRaw.value;
    try {
      let avatar: string;
      if (isNew) {
        avatar = await CH.createCharacter(character.value, pendingAvatarFile.value ?? undefined);
      } else {
        avatar = character.value.avatar;
        await CH.editCharacter(character.value, oldRaw.value, pendingAvatarFile.value ?? undefined);
      }
      // 保存后重新拉取最新原始数据，用于下次编辑的字段回退
      const latest = await CH.getCharacterByAvatar(avatar);
      if (latest) {
        character.value.avatar = avatar;
        oldRaw.value = latest.raw;
      }
      pendingAvatarFile.value = null;
      refreshCharacterList();
      structuralDirty.value = false;
      if (character.value) {
        fieldDirty.resetAll(
          CHARACTER_FIELDS.map((f): [string, FieldBaseline] => [
            f.key,
            fieldSnapshot(character.value!, f.key),
          ])
        );
        greetingDirty.resetAll(
          greetingIds.value.map((gid, i): [string, string] => [
            gid,
            character.value!.greetings[i] ?? '',
          ])
        );
        regexDirty.resetAll(character.value.regexs.map((s): [string, RegexScript] => [s.id, s]));
        scriptDirty.resetAll(character.value.scripts.map((s): [string, Script] => [s.id, s]));
      }
      showToast(t('character.toast.saved', { name: character.value?.name || avatar }));
    } catch (e: unknown) {
      showToast(
        t('character.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /** 单字段/单条问候语/单条脚本粒度的保存：以 oldRaw 为基线，只覆盖目标 item 一项后 edit，
   *  再重读刷新 oldRaw 并重设该 item 基线。新建项（isNew）回退到 doSaveCharacter 全量保存。 */
  async function saveItem(domain: string, key: string) {
    if (!character.value || !oldRaw.value) {
      showToast(t('character.toast.noDataToSave'));
      return;
    }
    const disk = CH.fromRaw(oldRaw.value as Record<string, unknown>);
    let target: Character;
    if (domain === 'character') {
      if (key.startsWith('field:greeting:')) {
        const gid = key.slice('field:greeting:'.length);
        const idx = greetingIds.value.indexOf(gid);
        if (idx < 0) return;
        if (greetingDirty.isNew(gid)) {
          await doSaveCharacter();
          return;
        }
        target = {
          ...disk,
          greetings: disk.greetings.map((g, i) =>
            i === idx ? character.value!.greetings[idx] : g
          ),
        };
      } else {
        const fieldKey = key.slice('field:'.length);
        target = { ...disk };
        const snapshot = fieldSnapshot(character.value, fieldKey);
        if (fieldKey === 'description') {
          target.description = snapshot as string;
        } else if (fieldKey === 'depthPrompt') {
          target.otherPrompts.depthPrompt = snapshot as Character['otherPrompts']['depthPrompt'];
        } else if (CHARACTER_FIELDS.some((f) => f.key === fieldKey)) {
          target.otherPrompts[fieldKey as OtherPromptTextKey] = snapshot as string;
        } else {
          return;
        }
      }
    } else if (domain === 'regex') {
      const cur = regexs.value.find((s) => s.id === key);
      if (!cur) return;
      if (regexDirty.isNew(key)) {
        await doSaveCharacter();
        return;
      }
      target = { ...disk, regexs: disk.regexs.map((s) => (s.id === key ? cur : s)) };
    } else if (domain === 'tavern') {
      const cur = scripts.value.find((s) => s.id === key);
      if (!cur) return;
      if (scriptDirty.isNew(key)) {
        await doSaveCharacter();
        return;
      }
      target = { ...disk, scripts: disk.scripts.map((s) => (s.id === key ? cur : s)) };
    } else {
      return;
    }
    try {
      await CH.editCharacter(target, oldRaw.value);
      const latest = await CH.getCharacterByAvatar(character.value.avatar);
      if (latest) oldRaw.value = latest.raw;
      if (domain === 'character') {
        if (key.startsWith('field:greeting:')) {
          const gid = key.slice('field:greeting:'.length);
          const idx = greetingIds.value.indexOf(gid);
          if (idx >= 0) greetingDirty.setBaseline(gid, character.value.greetings[idx]);
        } else {
          const fieldKey = key.slice('field:'.length);
          fieldDirty.setBaseline(fieldKey, fieldSnapshot(character.value, fieldKey));
        }
      } else if (domain === 'regex') {
        const s = regexs.value.find((x) => x.id === key);
        if (s) regexDirty.setBaseline(key, s);
      } else {
        const s = scripts.value.find((x) => x.id === key);
        if (s) scriptDirty.setBaseline(key, s);
      }
      refreshCharacterList();
      showToast(
        t('character.toast.saved', { name: character.value?.name || character.value?.avatar })
      );
    } catch (e) {
      showToast(
        t('character.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  function isTabDirty(domain: string, key: string): boolean {
    if (domain === 'character') {
      if (key.startsWith('field:greeting:'))
        return greetingDirty.isDirty(key.slice('field:greeting:'.length));
      return fieldDirty.isDirty(key.slice('field:'.length));
    }
    if (domain === 'regex') return regexDirty.isDirty(key);
    if (domain === 'tavern') return scriptDirty.isDirty(key);
    return false;
  }
  function discardTab(domain: string, key: string): void {
    if (domain === 'character') {
      if (key.startsWith('field:greeting:')) {
        const gid = key.slice('field:greeting:'.length);
        const baseline = greetingDirty.discard(gid);
        const idx = greetingIds.value.indexOf(gid);
        if (baseline === undefined) {
          if (character.value && idx >= 0 && character.value.greetings.length > 1) {
            character.value.greetings.splice(idx, 1);
            greetingIds.value.splice(idx, 1);
          }
        } else if (character.value && idx >= 0) {
          character.value.greetings[idx] = baseline;
        }
      } else {
        const fieldKey = key.slice('field:'.length);
        const baseline = fieldDirty.discard(fieldKey);
        if (character.value && baseline !== undefined) {
          if (fieldKey === 'depthPrompt' && typeof baseline === 'object') {
            character.value.otherPrompts.depthPrompt = baseline;
          } else if (typeof baseline === 'string') {
            setFieldValue(character.value, fieldKey, baseline);
          }
        }
      }
    } else if (domain === 'regex') {
      const baseline = regexDirty.discard(key);
      const i = regexs.value.findIndex((s) => s.id === key);
      if (baseline === undefined) {
        if (i >= 0) character.value?.regexs.splice(i, 1);
      } else if (i >= 0) {
        character.value?.regexs.splice(i, 1, baseline);
      }
      rebuildRegexOrder();
    } else if (domain === 'tavern') {
      const baseline = scriptDirty.discard(key);
      const i = scripts.value.findIndex((s) => s.id === key);
      if (baseline === undefined) {
        if (i >= 0) character.value?.scripts.splice(i, 1);
      } else if (i >= 0) {
        character.value?.scripts.splice(i, 1, baseline);
      }
      rebuildScriptTreeOrder();
    }
  }

  return {
    character,
    oldRaw,
    characterList,
    pendingAvatarFile,
    setPendingAvatar,
    dirty,
    markDirty,
    hasData,
    currentField,
    setCurrentFieldValue,
    markFieldDirty,
    markGreetingDirty,
    isTabDirty,
    discardTab,
    jumpToFieldHit,
    greetingIds,
    addGreeting,
    deleteGreeting,
    reorderGreeting,
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
    refreshCharacterList,
    loadCharacterByAvatar,
    switchCharacter,
    reloadCharacter,
    loadSelectedOrFirst,
    selectCharacterForPreview,
    createNewCharacter,
    removeCurrentCharacter,
    doSaveCharacter,
    saveItem,
  };
});
