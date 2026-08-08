/* 数字输入的"拖拽微调"：按住数字往左右拖，横向位移映射成数值增量。
 * 不依赖 min/max，拖多远都行，跟原生 <input type=number> 共存（键盘输入/上下箭头/滚轮照常）。
 * 按住 Shift 精细调整（每像素 0.1x step）。用 Pointer Events + setPointerCapture。
 *
 * 用法（NumberInput.vue 里）：
 *   const { onPointerDown } = useNumberDragScrub({
 *     get: () => props.modelValue,
 *     set: (v) => emit('update:modelValue', v),
 *     step: props.step,
 *   })
 *   <span @pointerdown="onPointerDown">拖拽手柄</span> */
import { ref, onUnmounted } from 'vue'
import { getHostWindow } from './hostEnv'

/** 挂在拖拽函数对象上的临时状态（由 onPointerDown 写入，onPointerMove/onPointerUp 读取）。 */
type ScrubFnState = ((e: PointerEvent) => void) & {
  startX: number
  startVal: number
  step: number
  pxPerStep: number
  moved: boolean
  target?: HTMLElement
}

export interface NumberDragScrubOptions {
  get: () => number | null
  set: (v: number) => void
  step?: number
  /** 每拖动多少像素相当于一个 step，默认 4px（越小越灵敏） */
  pxPerStep?: number
  min?: number
  max?: number
}

export function useNumberDragScrub(opts: NumberDragScrubOptions) {
  const dragging = ref(false)
  const hostWin = getHostWindow()
  let pointerId: number | null = null

  function clamp(v: number) {
    let out = v
    if (opts.min !== undefined) out = Math.max(opts.min, out)
    if (opts.max !== undefined) out = Math.min(opts.max, out)
    return out
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value || (pointerId !== null && e.pointerId !== pointerId)) return
    e.preventDefault()

    const startX = (onPointerMove as ScrubFnState).startX
    const startVal = (onPointerMove as ScrubFnState).startVal
    const step = (onPointerMove as ScrubFnState).step
    const pxPerStep = (onPointerMove as ScrubFnState).pxPerStep
    let moved = (onPointerMove as ScrubFnState).moved

    const dx = e.clientX - startX
    if (Math.abs(dx) > 2) moved = true
    const fine = e.shiftKey ? 0.1 : 1
    const delta = Math.round((dx / pxPerStep) * fine * step * 100) / 100
    const raw = startVal + delta
    // 整数 step 时结果也保持整数，避免出现 100.00000001 这种浮点尾巴
    const snapped = step >= 1 && Number.isInteger(step) ? Math.round(raw) : raw
    opts.set(clamp(snapped))

    ;(onPointerMove as ScrubFnState).moved = moved
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.value || (pointerId !== null && e.pointerId !== pointerId)) return
    const moved = (onPointerMove as ScrubFnState).moved
    const target = (onPointerUp as ScrubFnState).target as HTMLElement

    dragging.value = false
    pointerId = null
    hostWin.document.body.classList.remove('wb-no-select')
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)

    // hasPointerCapture 是方法，用 typeof 判存在后再调，避免不支持的环境报错。
    if (target && typeof target.hasPointerCapture === 'function' && pointerId !== null) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        // 元素可能已被移除，释放指针捕获失败可安全忽略
      }
    }

    if (!moved) {
      // 没有实际拖动（只是点了一下），让焦点落到输入框
      const input = target?.previousElementSibling as HTMLInputElement
      if (input) input.focus()
      return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  function onPointerDown(e: PointerEvent) {
    // 只响应主键，避免右键/中键触发拖拽
    if (e.button !== 0) return
    // 立即阻止浏览器默认行为（文本选择/原生拖拽/上下文菜单），防止浏览器接管指针事件导致 pointermove 丢失
    e.preventDefault()
    e.stopPropagation()

    pointerId = e.pointerId
    const target = e.currentTarget as HTMLElement
    ;(onPointerMove as ScrubFnState).startX = e.clientX
    ;(onPointerMove as ScrubFnState).startVal = opts.get() ?? 0
    ;(onPointerMove as ScrubFnState).step = opts.step ?? 1
    ;(onPointerMove as ScrubFnState).pxPerStep = opts.pxPerStep ?? 4
    ;(onPointerMove as ScrubFnState).moved = false
    ;(onPointerUp as ScrubFnState).target = target

    hostWin.document.body.classList.add('wb-no-select')
    dragging.value = true

    // 设置指针捕获
    try {
      target.setPointerCapture(pointerId)
    } catch {
      // 忽略指针捕获失败的情况
    }

    // 绑定事件到宿主窗口，解决iframe内拖拽出界后事件丢失的问题
    hostWin.addEventListener('pointermove', onPointerMove)
    hostWin.addEventListener('pointerup', onPointerUp)
    hostWin.addEventListener('pointercancel', onPointerUp)
  }

  onUnmounted(() => {
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)
    hostWin.document.body.classList.remove('wb-no-select')
  })

  return { dragging, onPointerDown }
}
