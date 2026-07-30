import { ref, reactive, computed, type CSSProperties } from 'vue'
import { getHostWindow } from './hostEnv'

/** FAB 拖拽 + 点击二合一。
 *
 * 行为契约（同时满足"随意拖"与"短按即开"）：
 *  - pointerdown 只记录起点，不 preventDefault、不启计时器。
 *  - pointermove：指针移动超过 dragThreshold → 立即进入拖动模式（不等长按），之后跟指针走。
 *  - pointerup：什么都不做——交给随后浏览器触发的 click 处理。
 *  - onClick：
 *      · 上一次 onPointerDown 经历过拖动（suppressClick=true）→ 吞掉这次 click，并 commit 位置；
 *      · 没拖过 → 放行 onTap（短按即开）。
 *
 * 关键：拖与点只用"指针有没有移动超过阈值"这一空间维度区分，不引入时间维度，
 * 因此慢按快松、快按快松都是纯点击；只有真把指针挪了超过阈值才算拖。
 * onClick 仍是 onTap 的唯一入口，避免 onUp 直接调 onTap 造成双触发。 */
export interface FabPos { x: number; y: number }

export interface UseFabDragOptions {
  /** FAB 的边长（正方形），需要跟 CSS 里 .wb-fab 的 width/height 保持一致。默认 48。 */
  size?: number
  /** 判定"这是一次拖动"而不是手指的自然抖动所需的最小位移，像素。默认 4。 */
  dragThreshold?: number
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

  const dragging = ref(false)
  let suppressClick = false

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
        // 指针还没挪过阈值——继续等，不算拖动开始。
        if (Math.abs(ev.clientX - startX) < dragThreshold && Math.abs(ev.clientY - startY) < dragThreshold) return
        // 超过阈值：立即进入拖动模式。把 FAB 当前渲染位置冻结成显式 left/top
        // （可能还锚定在默认的 bottom/right），之后才能让它自由跟着指针走。
        isDragging = true
        dragging.value = true
        suppressClick = true
        if (hostWin.navigator?.vibrate) hostWin.navigator.vibrate(40)
        const r = el.getBoundingClientRect()
        opts.setPos(clampPos(r.left, r.top))
        return
      }
      opts.setPos(clampPos(ev.clientX - size / 2, ev.clientY - size / 2))
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      if (isDragging) {
        dragging.value = false
        // commit 推迟到 onClick 里，与"吞 click"一起做，确保 click 先被吞再 commit。
      }
      // 未拖动：什么都不做，靠随后浏览器触发的 click → onClick → onTap 打开面板。
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)
  }

  function onClick() {
    if (suppressClick) {
      // 刚拖完：吞掉这次 trailing click，提交一次持久化。
      suppressClick = false
      opts.commit()
      return
    }
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
