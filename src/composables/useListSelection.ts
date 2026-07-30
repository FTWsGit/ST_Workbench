import { getHostWindow } from './hostEnv'

export type SelectMode = 'single' | 'ctrl' | 'shift'

export interface ClickModifiers { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

/**
 * 选择交互识别器：普通点击 / Ctrl+点击 / Shift+点击 / 长按 → 统一通过 `onSelect(mode, id)` 分发。
 * 不持有选择状态（无 applyMultiSelect 调用），由调用方通过 `onSelect` 提供。
 * `'single'` 模式透传给 onSelect——本应用单点行为不同于 applyMultiSelect（始终选中，不切换）。
 */
export function useListSelection<T>(opts: {
  onSelect: (mode: SelectMode, id: T) => void
  longPress?: { thresholdPx?: number; delayMs?: number; vibrate?: boolean }
}) {
  function onClick(id: T, e: ClickModifiers) {
    const mode: SelectMode = e.shiftKey ? 'shift' : (e.ctrlKey || e.metaKey) ? 'ctrl' : 'single'
    opts.onSelect(mode, id)
  }

  // ---- 长按（在拖拽手柄外的触摸/笔操作） ----
  // 长按完成分发为 'ctrl' 模式，等效桌面 Ctrl+点击的切换行为。
  let suppressClick = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  }
  /** 返回此 pointerdown 是否被长按跟踪认领。返回 false 表示未认领，调用方可继续尝试拖拽。 */
  function onPointerDown(id: T, e: PointerEvent): boolean {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.wb-drag-handle')) return false
    const hostWin = getHostWindow()
    const threshold = opts.longPress?.thresholdPx ?? 4
    const delay = opts.longPress?.delayMs ?? 200
    const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId

    // 在定时器触发前移动超过阈值则取消长按，让浏览器处理原生滚动。
    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (Math.abs(ev.clientX - startX) > threshold || Math.abs(ev.clientY - startY) > threshold) {
        cancelLongPress()
        hostWin.removeEventListener('pointermove', onMove)
        hostWin.removeEventListener('pointerup', onUp)
        hostWin.removeEventListener('pointercancel', onUp)
      }
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cancelLongPress()
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)

    longPressTimer = setTimeout(() => {
      longPressTimer = null
      opts.onSelect('ctrl', id)
      if (opts.longPress?.vibrate !== false && navigator.vibrate) navigator.vibrate(40)
      // 长按完成后的 trailing `click` 通过 consumeSuppressClick() 吞掉。
      suppressClick = true
    }, delay)
    return true
  }

  function consumeSuppressClick(): boolean {
    if (suppressClick) { suppressClick = false; return true }
    return false
  }

  return { onClick, onPointerDown, consumeSuppressClick, cancelLongPress }
}
