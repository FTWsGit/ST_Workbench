import { getHostDocument, getHostWindow } from './hostEnv'
import { ref } from 'vue'

const DRAG_THRESHOLD = 4
// AUTO_SCROLL_EDGE_PX：指针距顶部/底部边缘多近时触发自动滚动；AUTO_SCROLL_MAX_SPEED：边缘处滚动速度（px/帧），线性衰减到 0。
const AUTO_SCROLL_EDGE_PX = 70
const AUTO_SCROLL_MAX_SPEED = 40

/**
 * 基于 Pointer 的列表拖拽重排，泛型 T 覆盖所有域（PresetSidebar 用 gi / RegexSidebar 用索引 / 未来用 string 标识的列表）。
 * `dragOverIdx` 用 null（而非 -1）作为空值哨兵。自动滚动通过 `autoScrollContainer` getter 选择性启用。
 */
export function useDragReorder<T = number>(opts?: { autoScrollContainer?: () => HTMLElement | null | undefined }) {
  const dragIdx = ref<T | null>(null)
  const dragOverIdx = ref<T | null>(null)
  const dragOverPos = ref<'top' | 'bottom'>('top')
  /** 暴露 itemEls 供 useListScrollSync 共用——单一数据源，避免两套映射漂移。 */
  const itemEls = new Map<T, HTMLElement>()
  let suppressClick = false
  let dragScrollRAF: number | null = null

  function setItemRef(el: any, i: T) {
    if (el) itemEls.set(i, el as HTMLElement)
    else itemEls.delete(i)
  }
  /** 将指定项滚动到可视区域。若 `i` 未渲染则为空操作。 */
  function scrollItemIntoView(i: T) {
    const el = itemEls.get(i)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  // 用 requestAnimationFrame 节流 dragover 更新，仅当 (idx, pos) 实际变化时才触发射频。
  let dragRAF = 0
  let pendingOver: { idx: T; pos: 'top' | 'bottom' } | null = null
  function flushDragOver() {
    dragRAF = 0
    if (!pendingOver) return
    if (dragOverIdx.value !== pendingOver.idx) dragOverIdx.value = pendingOver.idx
    if (dragOverPos.value !== pendingOver.pos) dragOverPos.value = pendingOver.pos
  }
  // 确定指针所在项及上下半区（决定插入前/后）。指针超出列表范围时钳位到首/末项。
  function updateDragOver(clientY: number) {
    let bestIdx: T | null = null
    let bestPos: 'top' | 'bottom' = 'top'
    for (const [idx, el] of itemEls) {
      const r = el.getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) {
        bestIdx = idx
        bestPos = clientY < r.top + r.height / 2 ? 'top' : 'bottom'
        break
      }
    }
    if (bestIdx === null && itemEls.size) {
      const entries = Array.from(itemEls.entries())
      const [firstIdx, firstEl] = entries[0]
      const [lastIdx, lastEl] = entries[entries.length - 1]
      if (clientY < firstEl.getBoundingClientRect().top) { bestIdx = firstIdx; bestPos = 'top' }
      else if (clientY > lastEl.getBoundingClientRect().bottom) { bestIdx = lastIdx; bestPos = 'bottom' }
    }
    pendingOver = bestIdx === null ? null : { idx: bestIdx, pos: bestPos }
    if (!dragRAF) dragRAF = requestAnimationFrame(flushDragOver)
  }

  function stopDragScroll() {
    if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null }
  }
  function startDragScroll(container: HTMLElement, speed: number) {
    if (dragScrollRAF) return
    ;(function tick() {
      container.scrollTop += speed
      dragScrollRAF = requestAnimationFrame(tick)
    })()
  }
  /** 指针接近 `autoScrollContainer` 顶部/底部边缘时自动滚动。未配置则为空操作。 */
  function handleListAutoScroll(clientY: number) {
    const container = opts?.autoScrollContainer?.()
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (clientY - rect.top < AUTO_SCROLL_EDGE_PX) {
      startDragScroll(container, -Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - (clientY - rect.top) / AUTO_SCROLL_EDGE_PX)))
    } else if (rect.bottom - clientY < AUTO_SCROLL_EDGE_PX) {
      startDragScroll(container, Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - (rect.bottom - clientY) / AUTO_SCROLL_EDGE_PX)))
    } else {
      stopDragScroll()
    }
  }

  // 拖拽时禁止宿主文档文本选择。
  function suppressSelection() {
    const hostDoc = getHostDocument()
    hostDoc.body.style.userSelect = 'none'
    ;(hostDoc.body.style as any).webkitUserSelect = 'none'
  }
  function restoreSelection() {
    const hostDoc = getHostDocument()
    hostDoc.body.style.userSelect = ''
    ;(hostDoc.body.style as any).webkitUserSelect = ''
  }

  /**
   * 使用 Pointer Events 统一处理鼠标/触摸/笔。触摸拖拽限 .wb-drag-handle 元素内，避免与原生滚动冲突。
   * `onDrop` 职责窄化：(from, to, after) → 域内语义由调用方 onDrop 回调解释。
   */
  function onItemMouseDown(i: T, e: PointerEvent, onDrop: (from: T, to: T, after: boolean) => void) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
    } else if (!(e.target as HTMLElement).closest('.wb-drag-handle')) {
      return
    }
    const hostWin = getHostWindow()
    const startX = e.clientX, startY = e.clientY
    const pointerId = e.pointerId
    let dragging = false
    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        dragIdx.value = i
        suppressSelection()
      }
      updateDragOver(ev.clientY)
      handleListAutoScroll(ev.clientY)
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      restoreSelection()
      stopDragScroll()
      if (dragging) {
        // 真实拖拽后浏览器仍会触发原生 click，调用方应通过 consumeSuppressClick() 吞掉该事件。
        suppressClick = true
        const over = pendingOver
        if (over && over.idx !== i) onDrop(i, over.idx, over.pos === 'bottom')
      }
      dragIdx.value = null
      dragOverIdx.value = null
      pendingOver = null
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)
  }
  function consumeSuppressClick(): boolean {
    if (suppressClick) { suppressClick = false; return true }
    return false
  }
  return { dragIdx, dragOverIdx, dragOverPos, itemEls, setItemRef, onItemMouseDown, consumeSuppressClick, scrollItemIntoView }
}

