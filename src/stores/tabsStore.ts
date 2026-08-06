import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Domain, Workspace } from '../types'

/** 一个 tab 对应"某个 domain 里的某一条具体数据"。domain 和 key 的组合构成 tabId（判重）。
 *  跨 domain 允许重复 key；domain+key 组合唯一。 */
export interface OpenTab {
  domain: Domain
  key: string
  label: string
  /** 归属的工作区标识。跟 domain 分开、由调用方显式指定：
   *  同一 domain（如 'regex'）可能出现在不同 workspace 下，不能从 domain 反推。 */
  workspace: Workspace
}

function tabId(t: Pick<OpenTab, 'domain' | 'key'>): string {
  return t.domain + ':' + t.key
}

/** host-dependent domain（regex/tavern）的数据适配器：每个 host store 在初始化时
 *  调 registerDomainAdapter 把自己的 scripts 数组 + workspace + t 暴露出来。
 *  EditorShell/SettingsDock 通过 getDomainAdapter(domain, workspace) 拿到，
 *  不再直接 import presetStore/characterStore —— 路由容器回归"完全不持有 domain 知识"。
 *
 *  scripts 用 getter 函数而不是直接塞数组：响应式追踪在 getter 调用时建立，
 *  消费方（editorProps/formProps computed）每次读都拿到最新的、已 unwrap 的数组。
 *  如果直接塞 ComputedRef 进注册表，Vue 不会自动 unwrap ref 里的 ref，组件拿到的就是 ref 对象。 */
export interface DomainAdapter {
  scripts: () => any[]
  workspace: Workspace
  t: (key: any, params?: Record<string, string | number>) => string
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<OpenTab[]>([])

  /** host-dependent domain（regex/tavern）的适配器注册表：
   *  每个 host store 在 setup 时调 registerDomainAdapter 把自己暴露给路由容器。
   *  key = `${domain}:${workspace}`（如 'regex:preset' / 'tavern:character'）。 */
  const domainAdapters = ref<Record<string, DomainAdapter>>({})
  function registerDomainAdapter(domain: string, workspace: string, adapter: DomainAdapter) {
    domainAdapters.value[`${domain}:${workspace}`] = adapter
  }
  function getDomainAdapter(domain: string, workspace: string): DomainAdapter | undefined {
    return domainAdapters.value[`${domain}:${workspace}`]
  }

  /** 每个工作区各自记着自己的"当前激活标签 id"。分开存是为了关掉某个工作区的最后一个标签时只在自己
   *  工作区内找相邻项接棒焦点，不会切到别的工作区的标签；切换工作区也不会丢"上次编辑到哪个标签"。 */
  const activeIdByWorkspace = ref<Record<string, string | null>>({})

  /** 只读：当前激活工作区名下的 activeId。open()/close()/focus() 按目标 tab 自己的 workspace 操作
   *  activeIdByWorkspace，不经过这个 computed —— 调用点可能发生在非当前工作区。 */
  const activeId = computed<string | null>(() => activeIdByWorkspace.value[activeWorkspace.value] ?? null)

  const activeTab = computed<OpenTab | null>(
    () => tabs.value.find(t => tabId(t) === activeId.value) ?? null
  )

  /** 当前显示的顶层工作区（'preset' | 'worldbook' | 'character'）。 */
  const activeWorkspace = ref<Workspace>('preset')
  function setActiveWorkspace(ws: Workspace) { activeWorkspace.value = ws }

  /** TabBar 只渲染当前工作区的标签子集。其他工作区的标签原样留在 tabs 数组里，不清空不销毁。 */
  const tabsInActiveWorkspace = computed(() => tabs.value.filter(t => t.workspace === activeWorkspace.value))

  /** 每个工作区各自记着"工作区内部当前在看哪个集合"（条目列表 vs 正则列表）。
   *  只有 preset/character 有"条目 vs 正则"的选择；其他 workspace 兜底成 'items'。 */
  const sidebarCollectionByWorkspace = ref<Record<string, string>>({ preset: 'items', character: 'fields' })
  const sidebarCollection = computed(() => sidebarCollectionByWorkspace.value[activeWorkspace.value] ?? 'items')
  function setSidebarCollection(workspace: string, collection: string) { sidebarCollectionByWorkspace.value[workspace] = collection }

  /** Search/VarNav/Preview 三个面板的"开关状态"，按 workspace 分桶存。
   *  各自业务逻辑（doSearch()/rebuildVarIndex()/generatePreviewBlocks() 等）留在对应 store 里。
   *  copyPanelOpen 留在 presetStore —— CopyPanel 永远只属于 preset 工作区。 */
  const varNavOpenByWorkspace = ref<Record<string, boolean>>({})
  const previewOpenByWorkspace = ref<Record<string, boolean>>({})
  const varNavOpen = computed(() => varNavOpenByWorkspace.value[activeWorkspace.value] ?? false)
  const previewOpen = computed(() => previewOpenByWorkspace.value[activeWorkspace.value] ?? false)
  function setVarNavOpen(workspace: string, open: boolean) { varNavOpenByWorkspace.value[workspace] = open }
  function setPreviewOpen(workspace: string, open: boolean) { previewOpenByWorkspace.value[workspace] = open }

  /** 工具箱面板开关，同样按 workspace 分桶。工具箱是跨 workspace 通用的（preset/worldbook/character 都能开）。 */
  const toolBoxOpenByWorkspace = ref<Record<string, boolean>>({})
  const toolBoxOpen = computed(() => toolBoxOpenByWorkspace.value[activeWorkspace.value] ?? false)

  /* ====== Editor jump requests（跨域共享：preset/character/worldbook ContentEditor 都接 :jump=tabsStore.editorJump）======
   * token 递增：line/col 重复时也强制 watcher 触发。
   * `keepFocus: true`：只把匹配滚入视图，不移动 focus/selection 进编辑器——用于在搜索框内打字时
   * 预览当前匹配，而不偷走你正在打字的按键。 */
  const editorJump = ref<{ line: number; col: number; len: number; token: number; keepFocus: boolean } | null>(null)
  let jumpCounter = 0
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    jumpCounter++
    editorJump.value = { line, col, len, token: jumpCounter, keepFocus }
  }
  function setToolBoxOpen(workspace: string, open: boolean) { toolBoxOpenByWorkspace.value[workspace] = open }

  /** 按 domain 的"请滚动到当前选中项"信号。每个 domain 的侧边栏只监听自己的计数器。
   *  放在这里（tabsStore）而不是 presetStore 是因为它是 UI 布局状态（标签/侧边栏）而非业务数据，
   *  且需要对任意 domain 触发。open()/focus() 会自动触发，调用方无需手动请求滚动。 */
  const listScrollToken = ref<Record<string, number>>({})
  function requestListScroll(domain: string) {
    listScrollToken.value[domain] = (listScrollToken.value[domain] || 0) + 1
  }

  /** 打开一个标签。已存在则只 focus 不重复插入（label 允许刷新）。焦点写进 tab.workspace 名下。 */
  function open(tab: OpenTab) {
    const id = tabId(tab)
    const existing = tabs.value.find(t => tabId(t) === id)
    if (existing) existing.label = tab.label
    else tabs.value.push(tab)
    activeIdByWorkspace.value[tab.workspace] = id
    requestListScroll(tab.domain)
  }

  function close(domain: string, key: string) {
    const id = domain + ':' + key
    const i = tabs.value.findIndex(t => tabId(t) === id)
    if (i < 0) return
    const closedTab = tabs.value[i]
    const ws = closedTab.workspace
    const wasActive = activeIdByWorkspace.value[ws] === id

    // 焦点候选只在同一个工作区内的标签里找，不在 tabs 数组全局相邻下标里找。
    let fallback: OpenTab | null = null
    if (wasActive) {
      const siblings = tabs.value.filter(t => t.workspace === ws)
      const si = siblings.findIndex(t => tabId(t) === id)
      fallback = siblings[si + 1] ?? siblings[si - 1] ?? null
    }

    tabs.value.splice(i, 1)
    if (wasActive) activeIdByWorkspace.value[ws] = fallback ? tabId(fallback) : null
  }

  function closeAll() {
    tabs.value = []
    activeIdByWorkspace.value = {}
  }

  /** 只关掉某个 domain 的全部标签，不影响其他 domain。
   *  逐个影响到的 workspace 各自检查 activeId，避免跨 workspace 误影响。 */
  function closeDomain(domain: string) {
    const closingIds = new Set(tabs.value.filter(t => t.domain === domain).map(tabId))
    tabs.value = tabs.value.filter(t => t.domain !== domain)
    for (const ws of Object.keys(activeIdByWorkspace.value)) {
      const id = activeIdByWorkspace.value[ws]
      if (id && closingIds.has(id)) {
        const next = tabs.value.find(t => t.workspace === ws)
        activeIdByWorkspace.value[ws] = next ? tabId(next) : null
      }
    }
  }

  /** 按 workspace 清空全部标签，不清除其他 workspace 的标签。本工作区标签已全部清空，activeId 直接置空。 */
  function closeWorkspace(workspace: string) {
    tabs.value = tabs.value.filter(t => t.workspace !== workspace)
    activeIdByWorkspace.value[workspace] = null
  }

  /** 同步标签显示文字，不改 activeId、不触发 requestListScroll。用于逐字触发改名场景。 */
  function renameTab(domain: string, key: string, label: string) {
    const t = tabs.value.find(x => tabId(x) === domain + ':' + key)
    if (t) t.label = label
  }

  function focus(domain: string, key: string) {
    const id = domain + ':' + key
    const t = tabs.value.find(x => tabId(x) === id)
    if (t) {
      activeIdByWorkspace.value[t.workspace] = id
      requestListScroll(domain)
    }
  }

  function isOpen(domain: string, key: string): boolean {
    return tabs.value.some(t => t.domain === domain && t.key === key)
  }


  return {
    tabs, activeId, activeTab, open, renameTab, close, closeAll, closeDomain, closeWorkspace, focus, isOpen,
    sidebarCollection, setSidebarCollection, listScrollToken, requestListScroll,
    activeWorkspace, setActiveWorkspace, tabsInActiveWorkspace,
    varNavOpen, previewOpen, setVarNavOpen, setPreviewOpen,
    toolBoxOpen, setToolBoxOpen,
    editorJump, requestEditorJump,
    domainAdapters, registerDomainAdapter, getDomainAdapter,
  }
})
