import { ref, reactive, computed, type CSSProperties } from 'vue'
import { getHostWindow } from './hostEnv'

/** FAB 长按拖拽——自由两轴悬浮元素的长按拖动。
 *  拖动过程只改草稿，松手才提交一次。
 *  区分"点击"和"长按拖动"的做法：pointerdown 时不调用 preventDefault，长按计时器触发后才
 *  切换进拖动模式，并在 onClick 里吞掉紧随其后的那次 click。 */
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
    // 只按视口本身夹一下。CSS 默认位置处理 safe-area-inset-*，这里只处理用户手动拖动后的情况。
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
      opts.setPos(clampPos(ev.clientX - size / 2, ev.clientY - size / 2))
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cancelLongPress()
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      if (isDragging) {
        dragging.value = false
        opts.commit() // 松手才提交一次
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
      // 把 FAB 当前渲染位置冻结成显式的 left/top（可能还锚定在默认的 bottom/right），
      // 之后才能让它自由跟着指针走。
      const r = el.getBoundingClientRect()
      opts.setPos(clampPos(r.left, r.top))
    }, longPressMs)
  }

  function onClick() {
    if (suppressClick) { suppressClick = false; return }
    opts.onTap()
  }

  // 保存的位置如果被晾在可视区域外（转屏或窗口缩窄后），下次 resize 时拉回来。
  function onHostResize() {
    const pos = opts.getPos()
    if (!pos) return
    const clamped = clampPos(pos.x, pos.y)
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      opts.setPos(clamped)
      opts.commit()
    }
  }

  // reactive() 包一层，使模板里嵌套成员访问（`fab.dragging`/`fab.style`）能自动解包内部 ref/computed。
  return reactive({ dragging, style, onPointerDown, onClick, onHostResize })
}
