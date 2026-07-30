import { ref, reactive, watch, type Ref, type WatchSource } from 'vue'

/** 移动端布局把 sidebar/varNav/preview/settingsDock 等桌面端各占一列的东西，变成同一时刻至多
 *  显示一个的 off-canvas 抽屉/底部弹层。这个 composable 只管"现在哪一个抽屉是打开的"这一件事，
 *  只认一张 `panels` 表，每个面板声明自己的 key、开关状态、怎么关掉。 */
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

  // 'sidebar'/'tools' 是内置特殊值：每个工作区都有一个侧边栏和一个工具抽屉，不需要放进 panels 表。
  const visible = ref<string>('none')

  function toggleSidebar() { visible.value = visible.value === 'sidebar' ? 'none' : 'sidebar' }
  function toggleTools() { visible.value = visible.value === 'tools' ? 'none' : 'tools' }

  function close() {
    const panel = panels.find(p => p.key === visible.value)
    if (panel) panel.setOpen(false)
    visible.value = 'none'
  }

  // 工具抽屉里的每一项：先执行动作，再收起抽屉。若动作本身打开了某个受追踪的面板，下面的 watch
  // 会在同步处理后把 visible 重新指向那个面板。
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

  // reactive() 包一层，使模板里嵌套成员访问（`drawer.visible` 等）能自动解包内部 ref。
  return reactive({ visible, toggleSidebar, toggleTools, close, runTool })
}
