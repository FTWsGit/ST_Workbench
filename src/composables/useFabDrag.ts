import { ref, reactive, computed, type CSSProperties } from 'vue'
import { getHostWindow } from './hostEnv'

/** 【2026-07 从 App.vue 抽出】FAB 长按拖拽——跟任何 domain（preset/worldbook/character）都无关，
 *  纯粹是"一个自由悬浮元素怎么响应长按拖动"这一件事，之前之所以留在 App.vue 里没有单独抽出来，
 *  只是因为当时全项目只有它一个调用点，现在跟着 App.vue 瘦身一起挪过来，理由跟
 *  useMobileWorkspaceDrawer.ts 一样：机制本身不认识任何 workspace，抽成 composable 后 App.vue
 *  只剩下"把 uiStore.settings.fabPos 接给它"这一层胶水。
 *
 *  镜像 PresetSidebar.vue 里 onItemMouseDown 用的同一套长按判定参数（LONG_PRESS_MS/
 *  DRAG_THRESHOLD）、以及项目里所有落到 `settings` 的拖动统一遵守的"拖动过程只改草稿，松手才
 *  提交一次"规则（参见各处 usePanelResize 调用点）。没有直接复用 useDragReorder（那个是
 *  drop-target/列表场景）或 usePanelResize（只管单轴），FAB 是自由两轴悬浮元素，所以单独一个小
 *  composable，而不是硬套进已有的两个里。
 *
 *  区分"点击"和"长按拖动"、同时不拖慢点击响应的做法：pointerdown 时不调用 preventDefault，所以
 *  只要在 longPressMs 内 pointerup，浏览器该照常发一个原生 click，跟以前手感完全一样；只有当
 *  长按计时器真的触发了，才切换进拖动模式，并且在 onClick 里吞掉紧随其后的那次 click。 */
export interface FabPos { x: number; y: number }

export interface UseFabDragOptions {
  /** FAB 的边长（正方形），需要跟 CSS 里 .wb-fab 的 width/height 保持一致。默认 48。 */
  size?: number
  /** 判定"这是一次拖动"而不是手指的自然抖动所需的最小位移，像素。默认 4。 */
  dragThreshold?: number
  /** 长按判定所需的最小按住时长，毫秒。默认 100。 */
  longPressMs?: number
  /** 读取当前持久化的位置；返回空值表示还没有过拖动，走 CSS 默认的 bottom/right 锚定。 */
  getPos: () => FabPos | null | undefined
  /** 写入草稿位置——拖动过程中每帧都会调用，不应该在这里做持久化。 */
  setPos: (pos: FabPos) => void
  /** 拖动结束（pointerup）或 resize 把位置拉回可视区域之后，提交一次持久化。 */
  commit: () => void
  /** 一次「未被拖动吞掉」的点击。 */
  onTap: () => void
}

export function useFabDrag(opts: UseFabDragOptions) {
  const size = opts.size ?? 48
  const dragThreshold = opts.dragThreshold ?? 4
  const longPressMs = opts.longPressMs ?? 100

  const dragging = ref(false)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let suppressClick = false

  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  }

  function clampPos(x: number, y: number): FabPos {
    const hostWin = getHostWindow()
    // 只按视口本身夹一下，不管 env(safe-area-inset-*)——在 JS 里把 CSS env() 的值读回来还得走一趟
    // getComputedStyle，对这点边际收益不值得。CSS 默认位置（bottom/right，见 .wb-fab）本来就照顾
    // 了安全区的媒体查询，这里只处理"用户已经手动拖动过一次"之后的情况。
    const maxX = Math.max(0, hostWin.innerWidth - size)
    const maxY = Math.max(0, hostWin.innerHeight - size)
    return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
  }

  const style = computed<CSSProperties | undefined>(() => {
    const pos = opts.getPos()
    if (!pos) return undefined
    return { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' }
  })

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const hostWin = getHostWindow()
    const el = e.currentTarget as HTMLElement
    const startX = e.clientX, startY = e.clientY
    const pointerId = e.pointerId
    let isDragging = false

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (!isDragging) {
        // 长按计时器触发前发生了移动——不算拖动开始，只要指针基本没动就让计时器继续跑；一旦超过
        // 阈值，这就从来不是一次长按（比如一次意外的类拖拽手势），取消计时器，留给它变回一次普通点击。
        if (Math.abs(ev.clientX - startX) < dragThreshold && Math.abs(ev.clientY - startY) < dragThreshold) return
        cancelLongPress()
        return
      }
      opts.setPos(clampPos(ev.clientX - size / 2, ev.clientY - size / 2)) // 草稿，松手才提交
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cancelLongPress()
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      if (isDragging) {
        dragging.value = false
        opts.commit() // 松手才提交一次——跟 panel-resize/取色器等其它落到 settings 的拖动同一条规则
      }
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)

    longPressTimer = setTimeout(() => {
      longPressTimer = null
      isDragging = true
      dragging.value = true
      suppressClick = true
      if (hostWin.navigator?.vibrate) hostWin.navigator.vibrate(40)
      // 把 FAB 当前渲染出来的框冻结成显式的 left/top（这时它可能还锚定在默认的 bottom/right），
      // 冻结之后才能让它自由跟着指针走。
      const r = el.getBoundingClientRect()
      opts.setPos(clampPos(r.left, r.top))
    }, longPressMs)
  }

  function onClick() {
    if (suppressClick) { suppressClick = false; return }
    opts.onTap()
  }

  // 保存下来的位置如果被晾在可视区域外（最常见：转屏，或者把 FAB 拖到边缘后又把桌面浏览器窗口
  // 缩窄），下次 resize 时把它拉回来，而不是让它卡在一个够不着的地方。
  function onHostResize() {
    const pos = opts.getPos()
    if (!pos) return
    const clamped = clampPos(pos.x, pos.y)
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      opts.setPos(clamped)
      opts.commit()
    }
  }

  // reactive() 包一层，理由同 useMobileWorkspaceDrawer.ts 的返回值——模板里 `fab.dragging`/
  // `fab.style` 这种嵌套成员访问要靠 reactive 代理才能自动解包内部 ref/computed。
  return reactive({ dragging, style, onPointerDown, onClick, onHostResize })
}
