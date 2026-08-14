import { defineStore } from 'pinia';
import { ref, computed, watch, nextTick } from 'vue';
import type { Worldbook, WorldbookEntry, OrderNode, OrderGroup, OrderItem } from '../types';
import * as WB from '../api/worldbookApi';
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList';
import { useDirtyFlag } from '../composables/useDirtyFlag';
import { useItemDirty } from '../composables/useItemDirty';
import { useTabsStore } from './tabsStore';
import { useConfirmStore } from './confirmStore';
import { useUiStore } from './uiStore';

/** 独立文档 store：世界书是第一个不挂靠 presetStore 的工作区 —— 自己维护 entries + order。
 *  t()/showToast()/settings 直接 useUiStore() —— Pinia 保证整个 app 里永远拿到同一个实例。 */
export const useWorldbookStore = defineStore('worldbook', () => {
  const tabsStore = useTabsStore();
  const confirmStore = useConfirmStore();
  const uiStore = useUiStore();
  const t = uiStore.t;
  const showToast = uiStore.showToast;

  /* ====== Core State ====== */
  const entries = ref<WorldbookEntry[]>([]);
  const raw = ref<Record<string, Record<string, unknown>>>({});
  const order = ref<OrderNode[]>([]);
  const worldbookName = ref('');
  const worldbookList = ref<string[]>([]);

  /* ====== 分组树（同 preset 域，见 useGroupedList.ts 顶部 doc comment）======
   * identifier 统一用 String(entry.uid)。世界书没有 preset 那种"从 order 里摘掉=隐藏"的概念——
   * entries 和 order 永远是同一批次条目的两种视图，不存在 hiddenEntries。 */
  const {
    selectedGi,
    anchorGi,
    flatNodes,
    identifierToGi,
    revealAndFindGi,
    clearSelection,
    selectBlock,
    toggleGroupCollapse,
    reorderBlock: reorderBlockRaw,
    insertAfterActive,
    removeNode,
    bindSelected: bindSelectedNodes,
    unbindGroup: unbindGroupNode,
  } = useGroupedList(order, {
    groupName: (n) => t('worldbook.sidebar.defaultGroupName', { count: n }),
  });

  // 标签驱动侧边栏高亮/展开 —— 同 presetStore.ts 的 watcher 模式（flush:'sync' 理由相同）。
  watch(
    () => tabsStore.activeTab,
    (tab) => {
      if (!tab || tab.domain !== 'worldbook') return;
      const gi = revealAndFindGi(tab.key);
      if (gi < 0) return;
      if (anchorGi.value === gi && selectedGi.value.size === 1 && selectedGi.value.has(gi)) return;
      selectedGi.value = new Set([gi]);
      anchorGi.value = gi;
    },
    { immediate: true, flush: 'sync' }
  );

  /* ====== Dirty tracking ======
   * `order` 深 watch 记结构轴脏（重排/分组/折叠）；`entries` 深 watch 触发 syncFromValues
   *   按基线重算 per-item 脏，任何字段变异（编辑入口、启停）都自动打标。 */
  const { dirty: structuralDirty, markDirty } = useDirtyFlag();
  const entryDirty = useItemDirty<WorldbookEntry>(); // key = String(uid)
  watch(order, markDirty, { deep: true });
  watch(
    entries,
    () => {
      entryDirty.syncFromValues(
        entries.value.map((e): [string, WorldbookEntry] => [String(e.uid), e])
      );
    },
    { deep: true }
  );

  const currentEntry = computed<WorldbookEntry | null>(() => {
    const tab = tabsStore.activeTab;
    if (!tab || tab.domain !== 'worldbook') return null;
    return entries.value.find((e) => String(e.uid) === tab.key) ?? null;
  });
  const hasData = computed(() => worldbookName.value !== '');

  /* ====== order ⇄ entries 上的分组字段 互转，同 presetStore.ts 的模式。 */
  function importOrderWithGroups(list: WorldbookEntry[]): OrderNode[] {
    const groups = new Map<
      string,
      {
        name: string;
        collapsed: boolean;
        enabled: boolean;
        items: { entry: WorldbookEntry; idx: number }[];
      }
    >();
    list.forEach((entry) => {
      if (entry._gid) {
        if (!groups.has(entry._gid)) {
          groups.set(entry._gid, {
            name: entry._gname || 'Group',
            collapsed: entry._gcollapsed !== false,
            enabled: entry._genabled !== false,
            items: [],
          });
        }
        groups.get(entry._gid)!.items.push({ entry, idx: entry._gidx ?? 0 });
      }
    });
    groups.forEach((g) => g.items.sort((a, b) => a.idx - b.idx));
    const usedGroups = new Set<string>();
    const topLevel: OrderNode[] = [];
    list.forEach((entry) => {
      if (entry._gid) {
        if (usedGroups.has(entry._gid)) return;
        const g = groups.get(entry._gid)!;
        const group: OrderGroup = {
          id: 'group_' + entry._gid,
          _gid: entry._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map((x) => ({
            identifier: String(x.entry.uid),
            enabled: true,
          })),
        };
        topLevel.push(group);
        usedGroups.add(entry._gid);
      } else {
        topLevel.push({ identifier: String(entry.uid), enabled: true });
      }
    });
    return topLevel;
  }

  /** 把 order 树展平 → 写回每个 entry 的分组字段，并重排 entries 数组顺序（数组顺序 = 显示顺序）。 */
  function syncEntriesFromOrder() {
    const byId = new Map(entries.value.map((e) => [String(e.uid), e]));
    const ordered: WorldbookEntry[] = [];
    order.value.forEach((node) => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const e = byId.get(child.identifier);
          if (!e) return;
          e._gid = node._gid;
          e._gname = node.name;
          e._gcollapsed = node.collapsed;
          e._genabled = node.enabled;
          e._gidx = cidx;
          ordered.push(e);
        });
      } else {
        const e = byId.get(node.identifier);
        if (!e) return;
        delete e._gid;
        delete e._gname;
        delete e._gcollapsed;
        delete e._genabled;
        delete e._gidx;
        ordered.push(e);
      }
    });
    entries.value = ordered;
  }

  function applyLoaded(wb: Worldbook, rawSnap: Record<string, Record<string, unknown>>) {
    entries.value = wb.entries;
    raw.value = rawSnap;
    order.value = importOrderWithGroups(wb.entries);
    clearSelection();
    worldbookName.value = wb.name;
    tabsStore.closeWorkspace('worldbook');
    nextTick(() => {
      structuralDirty.value = false;
      entryDirty.resetAll(entries.value.map((e): [string, WorldbookEntry] => [String(e.uid), e]));
    });
  }

  function refreshWorldbookList() {
    WB.listWorldbooks()
      .then((names) => {
        worldbookList.value = names;
      })
      .catch((e: unknown) =>
        showToast(
          t('worldbook.toast.listFailed', { msg: e instanceof Error ? e.message : String(e) })
        )
      );
  }

  async function loadWorldbookByName(name: string, opts: { silent?: boolean } = {}) {
    let r: Awaited<ReturnType<typeof WB.getWorldbookByName>>;
    try {
      r = await WB.getWorldbookByName(name);
    } catch (e: unknown) {
      showToast(
        t('worldbook.toast.loadFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
      return;
    }
    if (!r) {
      showToast(t('worldbook.toast.notFound', { name }));
      return;
    }
    applyLoaded(r.worldbook, r.raw);
    if (!opts.silent) showToast(t('worldbook.toast.loaded', { name }));
  }

  function switchWorldbook(name: string) {
    if (!name || name === worldbookName.value) return;
    loadWorldbookByName(name);
  }

  function reloadWorldbook() {
    if (!worldbookName.value) {
      showToast(t('worldbook.toast.noneSelected'));
      return;
    }
    loadWorldbookByName(worldbookName.value, { silent: true });
  }

  async function doSaveWorldbook() {
    if (!hasData.value) {
      showToast(t('worldbook.toast.noDataToSave'));
      return;
    }
    syncEntriesFromOrder();
    try {
      await WB.saveWorldbook(
        {
          name: worldbookName.value,
          entries: entries.value,
        },
        raw.value
      );
      refreshWorldbookList();
      structuralDirty.value = false;
      entryDirty.resetAll(entries.value.map((e): [string, WorldbookEntry] => [String(e.uid), e]));
      showToast(t('worldbook.toast.saved', { name: worldbookName.value }));
    } catch (e: unknown) {
      showToast(
        t('worldbook.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /** 单条目保存：只把当前 entry 覆盖写回 ST，不动其他条目。新建条目（isNew）没有基线可比，
   *  回退到全量 doSaveWorldbook()。 */
  async function saveItem(domain: string, key: string) {
    if (domain !== 'worldbook') return;
    if (!hasData.value) {
      showToast(t('worldbook.toast.noDataToSave'));
      return;
    }
    const entry = entries.value.find((e) => String(e.uid) === key);
    if (!entry) return;
    if (entryDirty.isNew(key)) {
      await doSaveWorldbook();
      return;
    }
    const disk = WB.fromSTWorldbook(worldbookName.value, raw.value);
    const target: Worldbook = {
      name: worldbookName.value,
      entries: disk.entries.map((e) =>
        String(e.uid) === key
          ? {
              ...entry,
              _gid: e._gid,
              _gname: e._gname,
              _gcollapsed: e._gcollapsed,
              _genabled: e._genabled,
              _gidx: e._gidx,
            }
          : e
      ),
    };
    try {
      const saved = await WB.saveWorldbook(target, raw.value);
      raw.value = saved;
      entryDirty.setBaseline(key, entry);
      refreshWorldbookList();
      showToast(t('worldbook.toast.saved', { name: worldbookName.value }));
    } catch (e) {
      showToast(
        t('worldbook.toast.saveFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  async function createNewWorldbook(name: string) {
    refreshWorldbookList();
    if (worldbookList.value.includes(name)) {
      showToast(t('worldbook.toast.duplicateName'));
      return;
    }
    try {
      await WB.createWorldbook(name);
      refreshWorldbookList();
      // 写入后用 ST 返回的权威数据重新加载进 store，不假设刚建的一定是空的。
      const loaded = await WB.getWorldbookByName(name).catch(() => null);
      applyLoaded(loaded?.worldbook ?? { name, entries: [] }, loaded?.raw ?? {});
      showToast(t('worldbook.toast.created', { name }));
    } catch (e: unknown) {
      showToast(
        t('worldbook.toast.createFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /** 从角色卡内嵌世界书导入。`book` 来自 characterStore.oldRaw.data.character_book。
   *  跟 createNewWorldbook() 同模式：查重名 → 建空文件 → 写入内容 → 用 ST 返回的权威数据重新加载。 */
  async function importFromCharacterBook(
    book: Parameters<typeof WB.importCharacterBook>[1],
    name: string
  ) {
    if (!book) {
      showToast(t('worldbook.toast.importNoBook'));
      return;
    }
    refreshWorldbookList();
    if (worldbookList.value.includes(name)) {
      showToast(t('worldbook.toast.duplicateName'));
      return;
    }
    try {
      await WB.importCharacterBook(name, book);
      refreshWorldbookList();
      const loaded = await WB.getWorldbookByName(name).catch(() => null);
      applyLoaded(loaded?.worldbook ?? { name, entries: [] }, loaded?.raw ?? {});
      showToast(
        t('worldbook.toast.imported', {
          name,
          count: book.entries?.length ?? 0,
        })
      );
    } catch (e: unknown) {
      showToast(
        t('worldbook.toast.importFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  async function removeCurrentWorldbook() {
    const name = worldbookName.value;
    if (!name) return;
    try {
      await WB.deleteWorldbook(name);
      refreshWorldbookList();
      const next = worldbookList.value[0];
      if (next) await loadWorldbookByName(next, { silent: true });
      else {
        entries.value = [];
        raw.value = {};
        order.value = [];
        worldbookName.value = '';
        tabsStore.closeWorkspace('worldbook');
      }
      showToast(t('worldbook.toast.deleted', { name }));
    } catch (e: unknown) {
      showToast(
        t('worldbook.toast.deleteFailed', { msg: e instanceof Error ? e.message : String(e) })
      );
    }
  }

  /* ====== Entry Ops ====== */
  function addEntry() {
    if (!hasData.value) {
      showToast(t('worldbook.toast.loadFirst'));
      return;
    }
    const uid = entries.value.reduce((m, e) => Math.max(m, e.uid), -1) + 1;
    const entry: WorldbookEntry = {
      uid,
      name: '',
      enabled: true,
      content: '',
      strategy: {
        type: 'keyword',
        keys: [],
        keysSecondary: { logic: 'and_any', keys: [] },
        scanDepth: 'same_as_global',
        caseSensitive: null,
        matchWholeWords: null,
      },
      position: {
        type: 'before_character_definition',
        role: null,
        depth: 4,
        order: 100,
      },
      probability: 100,
      recursion: { preventIncoming: false, preventOutgoing: false, delayUntil: false },
      effect: { sticky: null, cooldown: null, delay: null },
    };
    entries.value.push(entry);
    const activeId = tabsStore.activeTab?.domain === 'worldbook' ? tabsStore.activeTab.key : null;
    insertAfterActive({ identifier: String(uid), enabled: true }, activeId);
    tabsStore.open({
      domain: 'worldbook',
      key: String(uid),
      label: entry.name || t('common.unnamed'),
      workspace: 'worldbook',
    });
    showToast(t('worldbook.toast.created2'));
  }

  function deleteEntry(gi: number) {
    const node = flatNodes.value[gi];
    if (!node) return;
    const name = node.isGroup
      ? (node.ref as OrderGroup).name || t('common.unnamed')
      : entries.value.find((e) => String(e.uid) === (node.ref as OrderItem).identifier)?.name ||
        t('common.new');
    const wasGroup = node.isGroup;
    confirmStore.ask({
      title: t('worldbook.confirm.deleteEntry.title'),
      message: t('worldbook.confirm.deleteEntry.message', { name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const removed = removeNode(gi);
        if (!removed) return;
        for (const id of removed.identifiers) tabsStore.close('worldbook', id);
        if (!wasGroup) {
          const ei = entries.value.findIndex((e) => String(e.uid) === removed.identifiers[0]);
          if (ei >= 0) entries.value.splice(ei, 1);
          entryDirty.remove(removed.identifiers[0]);
        } else {
          // 组内条目一起真删（世界书没有"隐藏条目"这个中间态，删组即删光其下的条目和数据）
          entries.value = entries.value.filter((e) => !removed.identifiers.includes(String(e.uid)));
          for (const id of removed.identifiers) entryDirty.remove(id);
        }
        showToast(t('worldbook.toast.entryDeleted'));
      },
    });
  }

  function toggleEntryDisabled(entry: WorldbookEntry) {
    entry.enabled = !entry.enabled;
  }

  /** 工具箱 Search 的通用"跳到命中"出口：展开折叠组 + 打开条目标签。世界书编辑器（HighlightedEditor）
   *  没有 jump 接口，不做编辑器跳转，滚侧边栏 + 开标签即可。 */
  function jumpToFieldHit(
    itemId: string,
    _fieldKey: string,
    _line: number,
    _col: number,
    _len: number
  ) {
    const entry = entries.value.find((e) => String(e.uid) === itemId);
    if (!entry) return;
    revealAndFindGi(String(entry.uid)); // 展开包含它的折叠组
    tabsStore.open({
      domain: 'worldbook',
      key: String(entry.uid),
      label: entry.name || t('common.unnamed'),
      workspace: 'worldbook',
    });
  }

  /** entry 重排：改 order 树后写回 entries（数组顺序 = 显示顺序），让 per-item dirty 生效。 */
  function reorderBlock(fromGi: number, toGi: number, after: boolean) {
    reorderBlockRaw(fromGi, toGi, after);
    syncEntriesFromOrder();
  }
  function bindSelected() {
    const result = bindSelectedNodes();
    if (!result) {
      showToast(t('preset.toast.select2PlusBlocks'));
      return;
    }
    syncEntriesFromOrder();
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }));
  }
  function unbindGroup(gi: number) {
    if (!unbindGroupNode(gi)) return;
    syncEntriesFromOrder();
    showToast(t('preset.toast.unbound'));
  }

  /* ====== 按条目脏状态查询/丢弃（供侧边栏 tab 点、内容编辑器保存按钮、settings 表单接线） ====== */
  function isEntryDirty(id: string): boolean {
    return entryDirty.isDirty(id);
  }
  function isGroupDirty(gi: number): boolean {
    const node = flatNodes.value[gi];
    if (!node || !node.isGroup) return false;
    return (node.ref as OrderGroup).children.some((c) => isEntryDirty(c.identifier));
  }
  function isTabDirty(domain: string, key: string): boolean {
    return domain === 'worldbook' && entryDirty.isDirty(key);
  }
  function discardTab(domain: string, key: string): void {
    if (domain !== 'worldbook') return;
    const baseline = entryDirty.discard(key);
    const i = entries.value.findIndex((e) => String(e.uid) === key);
    if (baseline === undefined) {
      // isNew：真删除
      const gi = revealAndFindGi(key);
      if (gi >= 0) removeNode(gi);
      if (i >= 0) entries.value.splice(i, 1);
    } else if (i >= 0) {
      entries.value.splice(i, 1, baseline);
    }
  }

  const dirty = computed(() => structuralDirty.value || entryDirty.anyDirty.value);

  return {
    entries,
    order,
    worldbookName,
    worldbookList,
    flatNodes,
    selectedGi,
    anchorGi,
    identifierToGi,
    revealAndFindGi,
    dirty,
    markDirty,
    currentEntry,
    hasData,
    refreshWorldbookList,
    loadWorldbookByName,
    switchWorldbook,
    reloadWorldbook,
    doSaveWorldbook,
    saveItem,
    createNewWorldbook,
    removeCurrentWorldbook,
    importFromCharacterBook,
    selectBlock,
    addEntry,
    deleteEntry,
    toggleEntryDisabled,
    jumpToFieldHit,
    toggleGroupCollapse,
    reorderBlock,
    bindSelected,
    unbindGroup,
    isEntryDirty,
    isGroupDirty,
    isTabDirty,
    discardTab,
  };
});
