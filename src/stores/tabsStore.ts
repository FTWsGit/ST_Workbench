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

  /** 【2026-07 重构】每个工作区各自记着自己的"当前激活标签id"，不是像之前那样全局共用一个
   *  `activeId` 指针。起因是三个工作区（preset/worldbook/character）落地后暴露出两个串台 bug：
   *    1. 关掉某个工作区最后一个标签时，原来的 close() 直接从"全部标签"这个大数组里找相邻项接棒
   *       焦点——工作区之间的标签在同一个数组里前后挨着放，选出来的"相邻项"经常是别的工作区的
   *       标签，导致关光世界书的标签后，编辑器忽然冒出一个预设的标签。
   *    2. 顶栏切换工作区（switchMode()）本身完全不碰 activeId——只要用户没有手动点开新工作区里
   *       的某个标签，activeTab 还是切换前那个工作区的标签，EditorShell/SettingsDock 单纯按
   *       activeTab.domain 路由，看到的还是旧工作区的内容，直到用户点开一个新标签才刷新过来。
   *  按 workspace 分开存了之后，activeTab 天然只会解析到"当前激活工作区"自己名下的标签，两个问题
   *  是同一个根因、同一次改动一起解决——不需要在 EditorShell.vue/SettingsDock.vue 里另外加
   *  "domain 是否属于当前 workspace"这种过滤逻辑。
   *  各工作区的 activeId 在切走之后依然保留在这个 map 里（"背景保活"，见 TODO.md 1.6），切回来时
   *  原样还在，不会因为切换工作区就丢了"上次编辑到哪个标签"这件事。 */
  const activeIdByWorkspace = ref<Record<string, string | null>>({})

  /** 只读——当前激活工作区名下的 activeId。不能做成 external-writable 的 computed 直接代理到
   *  `activeIdByWorkspace.value[activeWorkspace.value]`：open()/close()/focus() 这些函数操作的
   *  目标工作区是"这个标签自己归属的 workspace"，不一定等于"当前正在显示的 activeWorkspace"
   *  （比如 worldbookStore.applyLoaded() 会调 closeWorkspace('worldbook')，这个调用点未必发生在
   *  用户正显示着世界书工作区的时候）——所以这几个函数内部都显式按目标 tab/domain 自己的
   *  workspace 去操作 activeIdByWorkspace，不会经过、也不能经过 activeWorkspace 这个"当前显示的
   *  是哪个工作区"的间接层。 */
  const activeId = computed<string | null>(() => activeIdByWorkspace.value[activeWorkspace.value] ?? null)

  const activeTab = computed<OpenTab | null>(
    () => tabs.value.find(t => tabId(t) === activeId.value) ?? null
  )

  const settingsDockOpen = ref(true)
  function toggleSettingsDock() { settingsDockOpen.value = !settingsDockOpen.value }

  /** 当前显示的顶层工作区（'preset' | 'worldbook' | 后续的 'character'）。真正的顶层三态切换 UI
   *  在 App.vue 的 switchMode()，那边会把这个值和 sidebarMode 一起改；这里只管存这个值本身。 */
  const activeWorkspace = ref('preset')
  function setActiveWorkspace(ws: string) { activeWorkspace.value = ws }

  /** TabBar 只渲染当前工作区的标签子集——切到角色卡/世界书工作区时不该还看到预设/正则的标签占
   *  着位置。它们依然原样留在 tabs 数组里，不清空、不销毁（"背景保活"，见 TODO.md 1.6），只是
   *  不在标签栏露出；切回来的时候原样还在。 */
  const tabsInActiveWorkspace = computed(() => tabs.value.filter(t => t.workspace === activeWorkspace.value))

  const sidebarMode = ref<string>('preset')
  function setSidebarMode(mode: string) { sidebarMode.value = mode }

  /** Per-domain "please scroll your selected item into view" signal — domain-agnostic replacement
   *  for what used to be presetStore's preset-only `sidebarJumpToken`/`requestSidebarScroll()`. Each
   *  domain's sidebar list (Sidebar.vue for 'preset', RegexSidebarList.vue for 'regex', ...) watches
   *  only its own `listScrollToken[domain]` counter and scrolls its own currently-active item into
   *  view when it ticks.
   *
   *  Lives here (tabs store) rather than in presetStore (main) because it's UI-layout state about
   *  tabs/sidebars, not preset data, and because it needs to fire for ANY domain, not just blocks
   *  — see PROJECT_HANDOFF.md 架构总览 1/2. `open()` and `focus()` below both trigger it
   *  automatically, so callers that open/focus a tab never need to remember to request a scroll
   *  themselves: the two are inherently the same user action ("show me this item"). Domain call
   *  sites that jump WITHOUT going through open()/focus() (search-result jump, var-nav jump — both
   *  stay within an already-active preset tab) call requestListScroll('preset') directly from
   *  presetStore. */
  const listScrollToken = ref<Record<string, number>>({})
  function requestListScroll(domain: string) {
    listScrollToken.value[domain] = (listScrollToken.value[domain] || 0) + 1
  }

  /** 打开一个标签。已经开着就只 focus，不重复插入、也不挪到末尾——不然每次点一个已经打开的
   *  标签，它在标签栏里的位置还会跳来跳去，体验会很怪。label 允许在已存在时刷新（比如 block
   *  改名之后再从 sidebar 点开，标签上的文字要跟着更新）。
   *  激活焦点写进 tab.workspace 自己名下，不是当前 activeWorkspace——两者理论上应该一致（打开
   *  标签的入口只会出现在对应工作区的侧边栏里），这里显式用 tab.workspace 只是不依赖这个"应该
   *  一致"的假设，多一层保险。 */
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

    // 焦点候选只在同一个工作区内的标签里找——用 splice 之前的下标在"同工作区子序列"里定位，右边
    // 优先、没有就退到左边，都没有就空着，跟浏览器/VSCode关标签页的落焦行为一致。故意不用整个
    // tabs 数组的相邻下标（那是之前"关掉世界书最后一个标签，编辑器却冒出预设标签"那个 bug 的
    // 根因），只在 workspace 过滤后的子序列里找相邻项。
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

  /** 只关掉某个 domain 的全部标签——比如切换/重新加载预设时，指向旧数据的 block 标签（引用的
   *  identifier 在新预设里根本不存在了）需要清掉，但正则、世界书这些跟这次预设重载无关的标签
   *  不该被一起打扫掉，所以按 domain 精确清，不做"全部清空"。
   *  按每个受影响 workspace 各自检查、各自可能清空自己的 activeId——不假设某个 domain 只会出现在
   *  一个 workspace 下（正则 domain 现在恒属于 workspace='preset'，但角色卡工作区落地后会有另一份
   *  domain='regex' / workspace='character' 的标签，这里不应该因为清 'preset' 工作区的正则标签就
   *  连带影响到 'character' 工作区的 activeId，反之亦然）。 */
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

  /** 同 closeDomain，但按 workspace 清——预设工作区一次重载/切换要连带关掉的是"这个工作区里的
   *  全部标签"（block + 正则两个 domain 都算，因为正则是预设工作区的子模式，不是独立工作区，见
   *  上面 OpenTab.workspace 的 doc comment），不是全部 domain。用这个而不是 closeAll()，是因为
   *  closeAll() 会连带把角色卡/世界书工作区里跟这次预设重载完全无关的标签也清掉——工作区之间要
   *  "背景保活"（TODO.md 1.6：切换工作区不清空、不丢改动），一个工作区内部的重载动作不该有这种
   *  跨工作区的副作用。
   *  这个工作区的标签已经全部关掉了，activeId 直接清空——不像 close()/closeDomain() 那样还要找
   *  "同工作区的相邻标签"接棒（这个工作区已经一个不剩了，没有相邻的可接），更不能像重构前那样退回
   *  到"tabs 数组里随便剩下的第一个"，那正是本次要修的串台 bug 本身。 */
  function closeWorkspace(workspace: string) {
    tabs.value = tabs.value.filter(t => t.workspace !== workspace)
    activeIdByWorkspace.value[workspace] = null
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
    sidebarMode, setSidebarMode, settingsDockOpen, toggleSettingsDock, listScrollToken, requestListScroll,
    activeWorkspace, setActiveWorkspace, tabsInActiveWorkspace,
  }
})
