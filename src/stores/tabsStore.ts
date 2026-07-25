import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 一个 tab 对应"某个 domain 里的某一条具体数据"——预设块、正则脚本、世界书条目、角色卡字段……
 *  domain 用字符串而不是枚举，是因为这个 store 完全不需要知道每个 domain 具体是什么，它只管
 *  "开着哪些标签、谁是当前激活的、顺序是什么"，内容渲染完全交给调用方按 domain 路由到对应组件。
 *  key 只要求在同一 domain 内唯一（通常就是那条数据自己的 id/identifier）；跨 domain 允许重复，
 *  实际判重靠 domain+key 这个组合（见 tabId）。 */
export interface OpenTab {
  domain: string
  key: string
  label: string
  /** 这个标签归属哪个顶层工作区（'preset' | 'character' | 'worldbook'，同样是字符串不是枚举，
   *  理由跟 domain 一样）。故意跟 domain 分开、由调用方显式指定，不能从 domain 反推：预设工作区
   *  下的正则标签 domain 是 'regex'，workspace 却是 'preset'（正则是预设工作区内的子模式，不是
   *  独立工作区，见 TODO.md 1.5/1.6）；以后角色卡工作区里的正则标签 domain 同样是 'regex'，但
   *  workspace 会是 'character'——同一个 domain 字符串，两种不同的 workspace 归属，只有调用方
   *  自己知道现在开的是哪个工作区。 */
  workspace: string
}

function tabId(t: Pick<OpenTab, 'domain' | 'key'>): string {
  return t.domain + ':' + t.key
}

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref<OpenTab[]>([])
  const activeId = ref<string | null>(null)

  const activeTab = computed<OpenTab | null>(
    () => tabs.value.find(t => tabId(t) === activeId.value) ?? null
  )
    
  const settingsDockOpen = ref(true)
  function toggleSettingsDock() { settingsDockOpen.value = !settingsDockOpen.value }

  /** 当前显示的顶层工作区。阶段0先只加这个维度本身和 OpenTab 的归属标记（见上面 OpenTab.workspace
   *  的 doc comment）——真正的 预设|角色卡|世界书 三态切换 UI、以及这个值该怎么跟 sidebarMode
   *  配合，是阶段1/2 要做的事（TODO.md 1.4/1.6），现在唯一存在的工作区只有 'preset'，默认值就是
   *  它。setActiveWorkspace() 先留好函数签名给以后顶层切换按钮直接调用。 */
  const activeWorkspace = ref('preset')
  function setActiveWorkspace(ws: string) { activeWorkspace.value = ws }

  /** TabBar 只渲染当前工作区的标签子集——切到角色卡/世界书工作区时不该还看到预设/正则的标签占
   *  着位置。它们依然原样留在 tabs 数组里，不清空、不销毁（"背景保活"，见 TODO.md 1.6），只是
   *  不在标签栏露出；切回来的时候原样还在。 */
  const tabsInActiveWorkspace = computed(() => tabs.value.filter(t => t.workspace === activeWorkspace.value))

  const sidebarMode = ref<string>('preset')
  function setSidebarMode(mode: string) { sidebarMode.value = mode }

  /** Per-domain "please scroll your selected item into view" signal — domain-agnostic replacement
   *  for what used to be store.ts's preset-only `sidebarJumpToken`/`requestSidebarScroll()`. Each
   *  domain's sidebar list (Sidebar.vue for 'preset', RegexSidebarList.vue for 'regex', ...) watches
   *  only its own `listScrollToken[domain]` counter and scrolls its own currently-active item into
   *  view when it ticks.
   *
   *  Lives here (tabs store) rather than in store.ts (main) because it's UI-layout state about
   *  tabs/sidebars, not preset data, and because it needs to fire for ANY domain, not just blocks
   *  — see PROJECT_HANDOFF.md 架构总览 1/2. `open()` and `focus()` below both trigger it
   *  automatically, so callers that open/focus a tab never need to remember to request a scroll
   *  themselves: the two are inherently the same user action ("show me this item"). Domain call
   *  sites that jump WITHOUT going through open()/focus() (search-result jump, var-nav jump — both
   *  stay within an already-active preset tab) call requestListScroll('preset') directly from
   *  store.ts. */
  const listScrollToken = ref<Record<string, number>>({})
  function requestListScroll(domain: string) {
    listScrollToken.value[domain] = (listScrollToken.value[domain] || 0) + 1
  }

  /** 打开一个标签。已经开着就只 focus，不重复插入、也不挪到末尾——不然每次点一个已经打开的
   *  标签，它在标签栏里的位置还会跳来跳去，体验会很怪。label 允许在已存在时刷新（比如 block
   *  改名之后再从 sidebar 点开，标签上的文字要跟着更新）。 */
  function open(tab: OpenTab) {
    const id = tabId(tab)
    const existing = tabs.value.find(t => tabId(t) === id)
    if (existing) existing.label = tab.label
    else tabs.value.push(tab)
    activeId.value = id
    requestListScroll(tab.domain)
  }

  function close(domain: string, key: string) {
    const id = domain + ':' + key
    const i = tabs.value.findIndex(t => tabId(t) === id)
    if (i < 0) return
    tabs.value.splice(i, 1)
    if (activeId.value === id) {
      // 关掉的是当前激活的标签：焦点交给右边相邻的一个，右边没有就交给左边，都没有就空着——
      // 跟浏览器/VSCode关标签页的落焦行为一致，用户最不容易"找不到东西"。
      const next = tabs.value[i] ?? tabs.value[i - 1] ?? null
      activeId.value = next ? tabId(next) : null
    }
  }

  function closeAll() {
    tabs.value = []
    activeId.value = null
  }

  /** 只关掉某个 domain 的全部标签——比如切换/重新加载预设时，指向旧数据的 block 标签（引用的
   *  identifier 在新预设里根本不存在了）需要清掉，但正则、世界书这些跟这次预设重载无关的标签
   *  不该被一起打扫掉，所以按 domain 精确清，不做"全部清空"。 */
  function closeDomain(domain: string) {
    const closingActive = activeTab.value?.domain === domain
    tabs.value = tabs.value.filter(t => t.domain !== domain)
    if (closingActive) activeId.value = tabs.value[0] ? tabId(tabs.value[0]) : null
  }

  /** 同 closeDomain，但按 workspace 清——预设工作区一次重载/切换要连带关掉的是"这个工作区里的
   *  全部标签"（block + 正则两个 domain 都算，因为正则是预设工作区的子模式，不是独立工作区，见
   *  上面 OpenTab.workspace 的 doc comment），不是全部 domain。用这个而不是 closeAll()，是因为
   *  closeAll() 会连带把角色卡/世界书工作区里跟这次预设重载完全无关的标签也清掉——工作区之间要
   *  "背景保活"（TODO.md 1.6：切换工作区不清空、不丢改动），一个工作区内部的重载动作不该有这种
   *  跨工作区的副作用。 */
  function closeWorkspace(workspace: string) {
    const closingActive = activeTab.value?.workspace === workspace
    tabs.value = tabs.value.filter(t => t.workspace !== workspace)
    if (closingActive) activeId.value = tabs.value[0] ? tabId(tabs.value[0]) : null
  }

  /** 只同步某个标签的显示文字，不改 activeId、不触发 requestListScroll——用于"底层数据被
   *  改名了，如果它的标签正开着就把文字同步一下"这种场景（block/regex 改名输入框，逐字触发）。
   *  故意跟 open() 分开：open() 语义是"用户刚导航到这里"，理应顺带滚动侧边栏；改名不是导航，
   *  每敲一个字都顺带触发一次 scrollIntoView({behavior:'smooth'}) 会跟输入渲染抢主线程，
   *  是 PROJECT.md 里记录过的卡顿根因之一。标签没开着就是个静默 no-op。 */
  function renameTab(domain: string, key: string, label: string) {
    const t = tabs.value.find(x => tabId(x) === domain + ':' + key)
    if (t) t.label = label
  }

  function focus(domain: string, key: string) {
    const id = domain + ':' + key
    if (tabs.value.some(t => tabId(t) === id)) {
      activeId.value = id
      requestListScroll(domain)
    }
  }

  function isOpen(domain: string, key: string): boolean {
    return tabs.value.some(t => t.domain === domain && t.key === key)
  }


  return {
    tabs, activeId, activeTab, open, renameTab, close, closeAll, closeDomain, closeWorkspace, focus, isOpen,
    sidebarMode, setSidebarMode, settingsDockOpen, toggleSettingsDock, listScrollToken, requestListScroll,
    activeWorkspace, setActiveWorkspace, tabsInActiveWorkspace,
  }
})
