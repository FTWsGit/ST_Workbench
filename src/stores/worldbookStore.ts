import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { Worldbook, WorldbookEntry, OrderNode, OrderGroup, OrderItem } from '../types'
import * as WB from '../api/worldbookApi'
import { useGroupedList, isGroupNode as isGroup } from '../composables/useGroupedList'
import { useTabsStore } from './tabsStore'
import { useConfirmStore } from './confirmStore'
import { useUiStore } from './uiStore'

/** 独立文档 store：世界书是第一个不挂靠 presetStore 的工作区 —— 自己维护 entries + order。
 *  t()/showToast()/settings 直接 useUiStore() —— Pinia 保证整个 app 里永远拿到同一个实例。 */
export const useWorldbookStore = defineStore('worldbook', () => {
  const tabsStore = useTabsStore()
  const confirmStore = useConfirmStore()
  const uiStore = useUiStore()
  const t = uiStore.t
  const showToast = uiStore.showToast

  /* ====== Core State ====== */
  const entries = ref<WorldbookEntry[]>([])
  const order = ref<OrderNode[]>([])
  const worldbookName = ref('')
  const worldbookList = ref<string[]>([])

  /* ====== 分组树（同 preset 域，见 useGroupedList.ts 顶部 doc comment）======
   * identifier 统一用 String(entry.uid)。世界书没有 preset 那种"从 order 里摘掉=隐藏"的概念——
   * entries 和 order 永远是同一批次条目的两种视图，不存在 hiddenEntries。 */
  const {
    selectedGi, anchorGi, flatNodes, identifierToGi, revealAndFindGi,
    clearSelection, selectBlock, toggleGroupCollapse, reorderBlock,
    insertAfterActive, removeNode, bindSelected: bindSelectedNodes, unbindGroup: unbindGroupNode,
  } = useGroupedList(order, { groupName: (n) => t('worldbook.sidebar.defaultGroupName', { count: n }) })

  // 标签驱动侧边栏高亮/展开 —— 同 presetStore.ts 的 watcher 模式（flush:'sync' 理由相同）。
  watch(() => tabsStore.activeTab, (tab) => {
    if (!tab || tab.domain !== 'worldbook') return
    const gi = revealAndFindGi(tab.key)
    if (gi < 0) return
    if (anchorGi.value === gi && selectedGi.value.size === 1 && selectedGi.value.has(gi)) return
    selectedGi.value = new Set([gi])
    anchorGi.value = gi
  }, { immediate: true, flush: 'sync' })

  /* ====== Dirty tracking ======
   * entries 包含每条 entry 的内容字段（高频编辑），深监听开销大，所以浅监听 + markDirty() 显式打标。
   * order 是分组结构，量小，深监听无问题。 */
  const dirty = ref(false)
  function markDirty() { dirty.value = true }
  watch(order, markDirty, { deep: true })
  watch(entries, markDirty)

  const currentEntry = computed<WorldbookEntry | null>(() => {
    const tab = tabsStore.activeTab
    if (!tab || tab.domain !== 'worldbook') return null
    return entries.value.find(e => String(e.uid) === tab.key) ?? null
  })
  const hasData = computed(() => worldbookName.value !== '')

  /* ====== order ⇄ entries 上的分组字段 互转，同 presetStore.ts 的模式。 */
  function importOrderWithGroups(list: WorldbookEntry[]): OrderNode[] {
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: { entry: WorldbookEntry; idx: number }[] }>()
    list.forEach(entry => {
      if (entry._gid) {
        if (!groups.has(entry._gid)) {
          groups.set(entry._gid, {
            name: entry._gname || 'Group',
            collapsed: entry._gcollapsed !== false,
            enabled: entry._genabled !== false,
            items: [],
          })
        }
        groups.get(entry._gid)!.items.push({ entry, idx: entry._gidx ?? 0 })
      }
    })
    groups.forEach(g => g.items.sort((a, b) => a.idx - b.idx))
    const usedGroups = new Set<string>()
    const topLevel: OrderNode[] = []
    list.forEach(entry => {
      if (entry._gid) {
        if (usedGroups.has(entry._gid)) return
        const g = groups.get(entry._gid)!
        const group: OrderGroup = {
          id: 'group_' + entry._gid,
          _gid: entry._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map(x => ({ identifier: String(x.entry.uid), enabled: true })),
        }
        topLevel.push(group)
        usedGroups.add(entry._gid)
      } else {
        topLevel.push({ identifier: String(entry.uid), enabled: true })
      }
    })
    return topLevel
  }

  /** 把 order 树压平成 identifier → 分组元数据的映射，写回每个 entry。
   *  displayIndex 用数组下标隐式维护。 */
  function syncEntriesFromOrder() {
    let idx = 0
    const byId = new Map(entries.value.map(e => [String(e.uid), e]))
    order.value.forEach(node => {
      if (isGroup(node)) {
        node.children.forEach((child, cidx) => {
          const e = byId.get(child.identifier)
          if (!e) return
          e.displayIndex = idx++
          e._gid = node._gid; e._gname = node.name
          e._gcollapsed = node.collapsed; e._genabled = node.enabled; e._gidx = cidx
        })
      } else {
        const e = byId.get(node.identifier)
        if (!e) return
        e.displayIndex = idx++
        delete e._gid; delete e._gname; delete e._gcollapsed; delete e._genabled; delete e._gidx
      }
    })
  }

  function applyLoaded(wb: Worldbook) {
    entries.value = wb.entries
    order.value = importOrderWithGroups(wb.entries)
    clearSelection()
    worldbookName.value = wb.name
    tabsStore.closeWorkspace('worldbook')
    nextTick(() => { dirty.value = false })
  }

  function refreshWorldbookList() {
    WB.listWorldbooks().then(names => { worldbookList.value = names })
      .catch((e: any) => showToast(t('worldbook.toast.listFailed', { msg: e?.message || e })))
  }

  async function loadWorldbookByName(name: string, opts: { silent?: boolean } = {}) {
    let data: Worldbook | null
    try { data = await WB.getWorldbookByName(name) }
    catch (e: any) { showToast(t('worldbook.toast.loadFailed', { msg: e?.message || e })); return }
    if (!data) { showToast(t('worldbook.toast.notFound', { name })); return }
    applyLoaded(data)
    if (!opts.silent) showToast(t('worldbook.toast.loaded', { name }))
  }

  function switchWorldbook(name: string) {
    if (!name || name === worldbookName.value) return
    loadWorldbookByName(name)
  }

  function reloadWorldbook() {
    if (!worldbookName.value) { showToast(t('worldbook.toast.noneSelected')); return }
    loadWorldbookByName(worldbookName.value, { silent: true })
  }

  async function doSaveWorldbook() {
    if (!hasData.value) { showToast(t('worldbook.toast.noDataToSave')); return }
    syncEntriesFromOrder()
    try {
      await WB.saveWorldbook({ name: worldbookName.value, entries: entries.value })
      refreshWorldbookList()
      dirty.value = false
      showToast(t('worldbook.toast.saved', { name: worldbookName.value }))
    } catch (e: any) { showToast(t('worldbook.toast.saveFailed', { msg: e?.message || e })) }
  }

  async function createNewWorldbook(name: string) {
    refreshWorldbookList()
    if (worldbookList.value.includes(name)) { showToast(t('worldbook.toast.duplicateName')); return }
    try {
      await WB.createWorldbook(name)
      refreshWorldbookList()
      // 写入后用 ST 返回的权威数据重新加载进 store，不假设刚建的一定是空的。
      const loaded = await WB.getWorldbookByName(name).catch(() => null)
      applyLoaded(loaded ?? { name, entries: [] })
      showToast(t('worldbook.toast.created', { name }))
    } catch (e: any) { showToast(t('worldbook.toast.createFailed', { msg: e?.message || e })) }
  }

  /** 从角色卡内嵌世界书导入。`book` 来自 characterStore.oldRaw.data.character_book。
   *  跟 createNewWorldbook() 同模式：查重名 → 建空文件 → 写入内容 → 用 ST 返回的权威数据重新加载。 */
  async function importFromCharacterBook(book: { entries?: any[] } | null | undefined, name: string) {
    if (!book) { showToast(t('worldbook.toast.importNoBook')); return }
    refreshWorldbookList()
    if (worldbookList.value.includes(name)) { showToast(t('worldbook.toast.duplicateName')); return }
    try {
      await WB.importCharacterBook(name, book)
      refreshWorldbookList()
      const loaded = await WB.getWorldbookByName(name).catch(() => null)
      applyLoaded(loaded ?? { name, entries: [] })
      showToast(t('worldbook.toast.imported', { name, count: book.entries?.length ?? 0 }))
    } catch (e: any) { showToast(t('worldbook.toast.importFailed', { msg: e?.message || e })) }
  }

  async function removeCurrentWorldbook() {
    const name = worldbookName.value
    if (!name) return
    try {
      await WB.deleteWorldbook(name)
      refreshWorldbookList()
      const next = worldbookList.value[0]
      if (next) await loadWorldbookByName(next, { silent: true })
      else { entries.value = []; order.value = []; worldbookName.value = ''; tabsStore.closeWorkspace('worldbook') }
      showToast(t('worldbook.toast.deleted', { name }))
    } catch (e: any) { showToast(t('worldbook.toast.deleteFailed', { msg: e?.message || e })) }
  }

  /* ====== Entry Ops ====== */
  function addEntry() {
    if (!hasData.value) { showToast(t('worldbook.toast.loadFirst')); return }
    const uid = (entries.value.reduce((m, e) => Math.max(m, e.uid), -1)) + 1
    const entry: WorldbookEntry = {
      uid, comment: '', content: '', displayIndex: entries.value.length,
      keys: [], keysecondary: [], selective: false, selectiveLogic: 0,
      constant: false, keyWord: true, vectorized: false,
      disabled: false,
      position: 0, depth: 4, order: 100, role: null,
      probability: 100, useProbability: true, excludeRecursion: false, preventRecursion: false, delayUntilRecursion: false,
      scanDepth: null, caseSensitive: null, matchWholeWords: null,
      group: '', groupPrioritized: false, groupWeight: 100,
      sticky: null, cooldown: null, delay: null,
    }
    entries.value.push(entry)
    const activeId = tabsStore.activeTab?.domain === 'worldbook' ? tabsStore.activeTab.key : null
    insertAfterActive({ identifier: String(uid), enabled: true }, activeId)
    tabsStore.open({ domain: 'worldbook', key: String(uid), label: entry.comment || t('common.unnamed'), workspace: 'worldbook' })
    showToast(t('worldbook.toast.created2'))
  }

  function deleteEntry(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    const name = node.isGroup
      ? (node.ref as OrderGroup).name || t('common.unnamed')
      : entries.value.find(e => String(e.uid) === (node.ref as OrderItem).identifier)?.comment || t('common.new')
    const wasGroup = node.isGroup
    confirmStore.ask({
      title: t('worldbook.confirm.deleteEntry.title'),
      message: t('worldbook.confirm.deleteEntry.message', { name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const removed = removeNode(gi)
        if (!removed) return
        for (const id of removed.identifiers) tabsStore.close('worldbook', id)
        if (!wasGroup) {
          const ei = entries.value.findIndex(e => String(e.uid) === removed.identifiers[0])
          if (ei >= 0) entries.value.splice(ei, 1)
        } else {
          // 组内条目一起真删（世界书没有"隐藏条目"这个中间态，删组即删光其下的条目和数据）
          entries.value = entries.value.filter(e => !removed.identifiers.includes(String(e.uid)))
        }
        showToast(t('worldbook.toast.entryDeleted'))
      },
    })
  }

  function toggleEntryDisabled(entry: WorldbookEntry) {
    entry.disabled = !entry.disabled
    markDirty()
  }

  function bindSelected() {
    const result = bindSelectedNodes()
    if (!result) { showToast(t('preset.toast.select2PlusBlocks')); return }
    showToast(t('preset.toast.boundBlocks', { count: result.itemCount }))
  }
  function unbindGroup(gi: number) {
    if (unbindGroupNode(gi)) showToast(t('preset.toast.unbound'))
  }

  return {
    entries, order, worldbookName, worldbookList,
    flatNodes, selectedGi, anchorGi, identifierToGi,
    dirty, markDirty, currentEntry, hasData,
    refreshWorldbookList, loadWorldbookByName, switchWorldbook, reloadWorldbook,
    doSaveWorldbook, createNewWorldbook, removeCurrentWorldbook, importFromCharacterBook,
    selectBlock, addEntry, deleteEntry, toggleEntryDisabled,
    toggleGroupCollapse, reorderBlock, bindSelected, unbindGroup,
  }
})
