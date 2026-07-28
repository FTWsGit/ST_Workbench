/* 数字输入的"拖拽微调"——参考 Figma/AE 那种：按住数字往左右拖，横向位移映射成数值增量。
 * 不用原生 <input type=range>，理由见 WorldbookSettingsForm.vue 重构时的讨论：order/depth/
 * sticky/cooldown/delay 这些字段值域大多无界或没有"该被拖满一条轨道"的自然上限，range 语义在
 * 这种场景下要么范围设小了不够用，要么设大了每像素精度差。drag-scrub 不依赖 min/max，拖多远
 * 都行，跟原生 <input type=number> 共存（不是替换），键盘输入/上下箭头/滚轮该怎么用还怎么用。
 *
 * 用法（NumberInput.vue 里）：
 *   const { onPointerDown } = useNumberDragScrub({
 *     get: () => props.modelValue,
 *     set: (v) => emit('update:modelValue', v),
 *     step: props.step,
 *   })
 *   <span @pointerdown="onPointerDown">拖拽手柄</span>
 *
 * 按住 Shift 精细调整（每像素 0.1x step），跟大多数同类实现（Figma 等）的修饰键习惯一致。
 * 用 Pointer Events + setPointerCapture，风格上跟 usePanelResize.ts／useDragReorder.ts 一致，
 * 拖拽过程中还会给 body 加一个 no-select 类，避免拖的时候选中旁边的文字。 */
import { ref, onUnmounted } from 'vue'
import { getHostWindow } from './hostEnv'

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
    
    const startX = (onPointerMove as any).startX
    const startVal = (onPointerMove as any).startVal
    const step = (onPointerMove as any).step
    const pxPerStep = (onPointerMove as any).pxPerStep
    let moved = (onPointerMove as any).moved

    const dx = e.clientX - startX
    if (Math.abs(dx) > 2) moved = true
    const fine = e.shiftKey ? 0.1 : 1
    const delta = Math.round((dx / pxPerStep) * fine * step * 100) / 100
    const raw = startVal + delta
    // 整数 step 时结果也保持整数，避免出现 100.00000001 这种浮点尾巴
    const snapped = step >= 1 && Number.isInteger(step) ? Math.round(raw) : raw
    opts.set(clamp(snapped))

    ;(onPointerMove as any).moved = moved
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.value || (pointerId !== null && e.pointerId !== pointerId)) return
    const moved = (onPointerMove as any).moved
    const target = (onPointerUp as any).target as HTMLElement

    dragging.value = false
    pointerId = null
    hostWin.document.body.classList.remove('wb-no-select')
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)

    // 释放指针捕获
    if (target && target.hasPointerCapture && pointerId !== null) {
      try { target.releasePointerCapture(pointerId) } catch {}
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
    ;(onPointerMove as any).startX = e.clientX
    ;(onPointerMove as any).startVal = opts.get() ?? 0
    ;(onPointerMove as any).step = opts.step ?? 1
    ;(onPointerMove as any).pxPerStep = opts.pxPerStep ?? 4
    ;(onPointerMove as any).moved = false
    ;(onPointerUp as any).target = target

    hostWin.document.body.classList.add('wb-no-select')
    dragging.value = true

    // 设置指针捕获
    try {
      target.setPointerCapture(pointerId)
    } catch (err) {
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
