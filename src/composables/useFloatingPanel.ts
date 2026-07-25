import { ref, computed, onUnmounted, type CSSProperties } from 'vue'
import { getHostWindow, useIsMobile } from './hostEnv'

/** 所有悬浮窗共享同一个递增计数器来做"点哪个哪个到最上层"——比维护一个面板实例的数组/Set 简单
 *  得多，数字只增不减也完全无所谓（不会真的溢出，用户不可能在一个会话里点出 Number.MAX_SAFE_INTEGER
 *  次）。基准值 100010，卡在 main.css 已有的 z-index 序列（.wb-panel 100000 / .wb-modal-overlay
 *  100001 / .wb-toast 100002 / .pr-var-popup 100003）上方，保证悬浮窗永远盖在主面板和这些提示类
 *  UI 之上，不需要跟它们比大小。 */
let topZCounter = 100010

export interface UseFloatingPanelOptions {
  /** 初始宽高（像素）。 */
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
}

/** 悬浮窗的拖拽定位 + resize + z-index 置顶机制，domain-agnostic——不知道自己里面装的是
 *  CopyPanel 还是以后的 MetaPanel/ToolsPanel，只管"这个矩形框在哪、多大、盖在最上面与否"。
 *  从 CopyPanel.vue 原本写死的 `.wb-modal-overlay` 定中弹窗（无法拖动/resize/多开叠放）里抽出来，
 *  见 FloatingPanelShell.vue 顶部 doc comment 和 TODO.md 阶段0「抽悬浮窗 Shell 组件」。
 *
 *  坐标系：x/y 是面板左上角相对于它的定位祖先（`.wb-panel`，`inset:0` 铺满整个宿主视口）的像素
 *  偏移——跟 pointer 事件的 clientX/clientY 是同一个坐标系，因为 `.wb-panel` 相对宿主视口没有
 *  自己的偏移。跟 usePanelResize.ts 一样，所有 pointer 监听都挂在宿主顶层 window 上而不是裸
 *  `window`（这个 app 的脚本本身跑在 iframe 里，见 hostEnv.ts 顶部注释），否则拖拽在 Tavern
 *  Helper 环境下会直接不生效。 */
export function useFloatingPanel(opts: UseFloatingPanelOptions = {}) {
  const hostWin = getHostWindow()
  const isMobile = useIsMobile()

  const width = ref(opts.width ?? 720)
  const height = ref(opts.height ?? 520)
  const minWidth = opts.minWidth ?? 420
  const minHeight = opts.minHeight ?? 280

  // 首次创建即大致居中——用宿主 window 的尺寸估算就够了（跟 useIsMobile 读 hostWin.innerWidth
  // 是同一个近似，不需要真的量出 .wb-panel 自己的 rect），不需要等到 onMounted 才能算，因为这里
  // 用的是 window 尺寸而不是我们自己元素的尺寸。
  const x = ref(Math.max(0, (hostWin.innerWidth - width.value) / 2))
  const y = ref(Math.max(0, (hostWin.innerHeight - height.value) / 2))

  const zIndex = ref(0)
  function bringToFront() { zIndex.value = ++topZCounter }
  bringToFront() // 刚创建出来的悬浮窗默认就是当前最上层的那个

  /* ---- 拖拽移动（从 header 发起）---- */
  let dragPointerId: number | null = null
  let dragStartX = 0, dragStartY = 0, dragOriginX = 0, dragOriginY = 0
  const dragging = ref(false)
  function onDragMove(e: PointerEvent) {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return
    x.value = dragOriginX + (e.clientX - dragStartX)
    y.value = dragOriginY + (e.clientY - dragStartY)
  }
  function onDragUp(e: PointerEvent) {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return
    dragPointerId = null
    dragging.value = false
    hostWin.document.body.style.userSelect = ''
    hostWin.removeEventListener('pointermove', onDragMove)
    hostWin.removeEventListener('pointerup', onDragUp)
    hostWin.removeEventListener('pointercancel', onDragUp)
  }
  function onDragStart(e: PointerEvent) {
    if (isMobile.value) return // 移动端是贴底满宽的 sheet，位置由 CSS 固定，不允许拖
    e.preventDefault()
    bringToFront()
    dragging.value = true
    dragPointerId = e.pointerId
    dragStartX = e.clientX; dragStartY = e.clientY
    dragOriginX = x.value; dragOriginY = y.value
    hostWin.document.body.style.userSelect = 'none'
    hostWin.addEventListener('pointermove', onDragMove)
    hostWin.addEventListener('pointerup', onDragUp)
    hostWin.addEventListener('pointercancel', onDragUp)
  }

  /* ---- resize（右下角把手）---- */
  let resizePointerId: number | null = null
  let resizeStartX = 0, resizeStartY = 0, resizeStartW = 0, resizeStartH = 0
  function onResizeMove(e: PointerEvent) {
    if (resizePointerId === null || e.pointerId !== resizePointerId) return
    // 上限留 8px 边距，纯粹是不让面板右/下边缘完全顶死视口边界，视觉上留口气；不是什么精确
    // 约束，用 hostWin.innerWidth/innerHeight 估算即可。
    const maxW = hostWin.innerWidth - x.value - 8
    const maxH = hostWin.innerHeight - y.value - 8
    width.value = Math.max(minWidth, Math.min(maxW, resizeStartW + (e.clientX - resizeStartX)))
    height.value = Math.max(minHeight, Math.min(maxH, resizeStartH + (e.clientY - resizeStartY)))
  }
  function onResizeUp(e: PointerEvent) {
    if (resizePointerId === null || e.pointerId !== resizePointerId) return
    resizePointerId = null
    hostWin.document.body.style.userSelect = ''
    hostWin.removeEventListener('pointermove', onResizeMove)
    hostWin.removeEventListener('pointerup', onResizeUp)
    hostWin.removeEventListener('pointercancel', onResizeUp)
  }
  function onResizeStart(e: PointerEvent) {
    if (isMobile.value) return // 移动端没有并排的邻居可比大小，resize 手柄本身也不渲染
    e.preventDefault()
    bringToFront()
    resizePointerId = e.pointerId
    resizeStartX = e.clientX; resizeStartY = e.clientY
    resizeStartW = width.value; resizeStartH = height.value
    hostWin.document.body.style.userSelect = 'none'
    hostWin.addEventListener('pointermove', onResizeMove)
    hostWin.addEventListener('pointerup', onResizeUp)
    hostWin.addEventListener('pointercancel', onResizeUp)
  }

  onUnmounted(() => {
    hostWin.removeEventListener('pointermove', onDragMove)
    hostWin.removeEventListener('pointerup', onDragUp)
    hostWin.removeEventListener('pointercancel', onDragUp)
    hostWin.removeEventListener('pointermove', onResizeMove)
    hostWin.removeEventListener('pointerup', onResizeUp)
    hostWin.removeEventListener('pointercancel', onResizeUp)
  })

  /** 面板本体的内联样式。移动端不下发 left/top/width/height——那几项交给 CSS 的
   *  `.wb-float-shell.mobile` 规则（贴底满宽 sheet），内联样式跟 class 规则打架的话内联永远赢，
   *  所以移动端这里只给 z-index，位置/尺寸完全交给 CSS。 */
  const style = computed<CSSProperties>(() => {
    if (isMobile.value) return { zIndex: String(zIndex.value) }
    return {
      left: x.value + 'px', top: y.value + 'px',
      width: width.value + 'px', height: height.value + 'px',
      zIndex: String(zIndex.value),
    }
  })

  return { isMobile, style, dragging, bringToFront, onDragStart, onResizeStart }
}
