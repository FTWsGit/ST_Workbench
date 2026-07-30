import { ref, onUnmounted } from 'vue'
import { getHostWindow } from './hostEnv'

/**
 * 拖拽调整面板宽度。`getWidth`/`setWidth` 由调用方决定宽度存储位置。
 * `dir`：'right'（左锚点面板右边缘）/ 'left'（右锚点面板左边缘）。
 * 监听器附加到宿主 window（因可能嵌入 iframe）。使用 Pointer Events 统一处理鼠标/触摸/笔。
 */
export function usePanelResize(opts: {
  getWidth: () => number
  setWidth: (w: number) => void
  min: number
  max: number
  dir: 'right' | 'left'
}) {
  const active = ref(false)
  let startX = 0
  let startW = 0
  let pointerId: number | null = null
  const hostWin = getHostWindow()

  function onPointerMove(e: PointerEvent) {
    if (!active.value || (pointerId !== null && e.pointerId !== pointerId)) return
    const delta = e.clientX - startX
    const raw = opts.dir === 'right' ? startW + delta : startW - delta
    opts.setWidth(Math.max(opts.min, Math.min(opts.max, raw)))
  }
  function onPointerUp(e: PointerEvent) {
    if (!active.value || (pointerId !== null && e.pointerId !== pointerId)) return
    active.value = false
    pointerId = null
    hostWin.document.body.style.cursor = ''
    hostWin.document.body.style.userSelect = ''
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)
  }
  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    active.value = true
    pointerId = e.pointerId
    startX = e.clientX
    startW = opts.getWidth()
    hostWin.document.body.style.cursor = 'col-resize'
    hostWin.document.body.style.userSelect = 'none'
    hostWin.addEventListener('pointermove', onPointerMove)
    hostWin.addEventListener('pointerup', onPointerUp)
    hostWin.addEventListener('pointercancel', onPointerUp)
  }

  onUnmounted(() => {
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)
  })

  // 保留旧名 onMouseDown 作为别名，兼容过渡期调用方。
  return { active, onMouseDown: onPointerDown, onPointerDown }
}
