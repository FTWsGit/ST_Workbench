import { ref, reactive, watch, type Ref, type WatchSource } from 'vue'

/** 【2026-07 从 App.vue 抽出】移动端布局把 sidebar/varNav/preview/settingsDock 这几个桌面端本来
 *  各占一列的东西，全部变成同一时刻至多显示一个的 off-canvas 抽屉/底部弹层（sidebar 走左侧
 *  drawer，其余走底部 sheet，见 main.css 里 @media (max-width) 那部分）。这个 composable 只管
 *  "现在哪一个抽屉是打开的"这一件事，本身完全不知道 varNav/preview 具体是什么、也不知道以后
 *  可能会有 worldbook 自己的 search 抽屉——它只认一张 `panels` 表，每个面板自己声明"我的 key
 *  叫什么、我开着没、怎么把我关掉"。
 *
 *  之前这套状态机硬编码在 App.vue 里，varNav/preview/settingsDock 三个面板各自手写了几乎一样的
 *  一段 watch。以后要给 worldbook 加它自己的 search 抽屉，不需要碰这个文件——在调用方
 *  （App.vue，未来是 workspaceRegistry 驱动的地方）的 panels 数组里多加一项就行。 */
export interface MobileDrawerPanel {
  /** mobileDrawerVisible 用来标识这个面板的字符串，比如 'varNav'/'preview'/'settingsDock'。 */
  key: string
  /** 这个面板底层的开关状态（通常是某个 store 的 computed）。 */
  isOpen: WatchSource<boolean>
  /** 抽屉被"叉掉"（backdrop 点击/再次点自己的按钮关闭）时，把底层开关也真的关掉——不只是隐藏
   *  抽屉视觉——不然视口后来变宽越过移动端断点时，这个面板会突然凭空冒出来，很突兀。 */
  setOpen: (open: boolean) => void
}

export interface UseMobileWorkspaceDrawerOptions {
  isMobile: Ref<boolean>
  panels: MobileDrawerPanel[]
  /** 触发时把抽屉切到 'sidebar'——比如切换 workspace、或者切换"条目/正则"集合之后，用户大概率
   *  想看的正是刚才变化的那个侧边栏。 */
  revealSidebarOn?: WatchSource<unknown>[]
  /** 触发时把抽屉整个收起来——比如选中了新标签，或者在已打开的标签内部跳到了别处（编辑器内部
   *  跳转，activeId 本身不变，所以不能只靠 activeId 的 watch）。 */
  closeOn?: WatchSource<unknown>[]
}

export function useMobileWorkspaceDrawer(opts: UseMobileWorkspaceDrawerOptions) {
  const { isMobile, panels, revealSidebarOn = [], closeOn = [] } = opts

  // 'sidebar'/'tools' 是内置的两个特殊值：每个工作区都有一个侧边栏，也永远只有一个 ⋯ 工具抽屉，
  // 不需要放进 panels 表里当成"面板"（它们没有对应的底层开关状态可以关，tools 甚至根本不对应
  // 任何 store 状态，只是临时 UI）。除此之外的值全部来自 panels 表，调用方随便加。
  const visible = ref<string>('none')

  function toggleSidebar() { visible.value = visible.value === 'sidebar' ? 'none' : 'sidebar' }
  function toggleTools() { visible.value = visible.value === 'tools' ? 'none' : 'tools' }

  function close() {
    const panel = panels.find(p => p.key === visible.value)
    if (panel) panel.setOpen(false)
    visible.value = 'none'
  }

  // 工具抽屉里的每一项：先执行动作，再收起抽屉。如果动作本身打开了某个受追踪的面板（比如点了
  // "搜索"），下面的 watch 会在这次同步处理完之后可靠地把 visible 重新指向那个面板——Vue 默认的
  // watcher 刷新时机在这个同步 handler 跑完之后，"收起工具抽屉"和"打开新抽屉"不会抢跑。
  function runTool(fn: () => void) {
    fn()
    visible.value = 'none'
  }

  for (const panel of panels) {
    watch(panel.isOpen, (open) => {
      if (!isMobile.value) return
      if (open) visible.value = panel.key
      else if (visible.value === panel.key) visible.value = 'none'
    })
  }
  for (const src of revealSidebarOn) {
    watch(src, () => { if (isMobile.value) visible.value = 'sidebar' })
  }
  for (const src of closeOn) {
    watch(src, () => { if (isMobile.value) visible.value = 'none' })
  }

  // reactive() 包一层是为了模板里 `drawer.visible === 'sidebar'` 这种嵌套成员访问能自动解包内部
  // ref——Vue 的模板 ref 自动解包只对 setup() 返回的顶层绑定生效，像这里这样从 composable 拿到
  // 一个内嵌 `visible: Ref<string>` 的普通对象，`drawer.visible` 在模板里取到的会是 Ref 对象本身
  // 而不是它的值，得手写 `.value`。包 reactive() 之后走的是 reactive 代理的自动解包，模板里可以
  // 像原来 `mobileDrawerVisible` 是顶层 ref 时一样直接用。
  return reactive({ visible, toggleSidebar, toggleTools, close, runTool })
}
