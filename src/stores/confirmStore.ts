import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 泛用模态确认/输入 store。
 *
 * 三个独立流程，均由 Modals.vue 渲染：
 *  - ask()/confirm()/cancel()："你确定吗"风格 —— title + message（支持简单 HTML）+ 确认/取消按钮文字 +
 *    onCancel（用于回退 UI 状态）。`danger`（默认 true）切换确认按钮为红色强调样式。
 *  - askInput()/confirmPrompt()/cancelPrompt()：单行文本输入 + 确认回调。替代 window.prompt()。
 *  - askMulti()/confirmMulti()/cancelMulti()：多文档清单式确认，用于"汇总展示多份未保存改动"场景。
 *
 * 三个 flow 都是扁平状态而非队列——此应用不会同时弹出两个需要排队的确认框。
 */
export interface ConfirmMultiItem {
  /** 一行列表项要显示的文字，调用方自己拼好（比如"预设：MyPreset *"），这个 store 不关心
   *  文档具体属于哪个 domain/workspace，只管把字符串摆出来。 */
  label: string
}

export interface ConfirmMultiOptions {
  title: string
  /** 列表上方的一句引导文字，跟 ConfirmOptions.message 一样允许简单 HTML，调用方自己转义。 */
  message?: string
  items: ConfirmMultiItem[]
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel?: () => void
}
export interface ConfirmOptions {
  title: string
  message: string // 允许简单 HTML（<strong>之类），调用方自己负责转义插入的用户数据
  confirmText?: string
  cancelText?: string
  danger?: boolean // 危险操作（删除类）用红色强调，默认 true
  onConfirm: () => void
  onCancel?: () => void
}

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  initialValue?: string
  confirmText?: string
  cancelText?: string
  onConfirm: (value: string) => void
}

export const useConfirmStore = defineStore('confirm', () => {
  /* ====== Confirm ====== */
  const open = ref(false)
  const title = ref('')
  const message = ref('')
  const confirmText = ref('OK')
  const cancelText = ref('Cancel')
  const danger = ref(true)
  let onConfirmCb: (() => void) | null = null
  let onCancelCb: (() => void) | null = null

  function ask(opts: ConfirmOptions) {
    title.value = opts.title
    message.value = opts.message
    confirmText.value = opts.confirmText ?? 'OK'
    cancelText.value = opts.cancelText ?? 'Cancel'
    danger.value = opts.danger ?? true
    onConfirmCb = opts.onConfirm
    onCancelCb = opts.onCancel ?? null
    open.value = true
  }
  function confirm() {
    open.value = false
    const cb = onConfirmCb
    onConfirmCb = null; onCancelCb = null
    cb?.()
  }
  function cancel() {
    open.value = false
    const cb = onCancelCb
    onConfirmCb = null; onCancelCb = null
    cb?.()
  }

  /* ====== Prompt (single-line text input) ====== */
  const promptOpen = ref(false)
  const promptTitle = ref('')
  const promptMessage = ref('')
  const promptPlaceholder = ref('')
  const promptValue = ref('')
  const promptConfirmText = ref('OK')
  const promptCancelText = ref('Cancel')
  let onPromptConfirmCb: ((value: string) => void) | null = null

  function askInput(opts: PromptOptions) {
    promptTitle.value = opts.title
    promptMessage.value = opts.message ?? ''
    promptPlaceholder.value = opts.placeholder ?? ''
    promptValue.value = opts.initialValue ?? ''
    promptConfirmText.value = opts.confirmText ?? 'OK'
    promptCancelText.value = opts.cancelText ?? 'Cancel'
    onPromptConfirmCb = opts.onConfirm
    promptOpen.value = true
  }
  function confirmPrompt() {
    const v = promptValue.value.trim()
    if (!v) return // 空值直接挡住、不关弹窗——调用方不需要自己再校验"不能为空"
    promptOpen.value = false
    const cb = onPromptConfirmCb
    onPromptConfirmCb = null
    cb?.(v)
  }
  function cancelPrompt() {
    promptOpen.value = false
    onPromptConfirmCb = null
  }

  /* ====== Confirm Multi（多文档清单式确认）====== */
  const multiOpen = ref(false)
  const multiTitle = ref('')
  const multiMessage = ref('')
  const multiItems = ref<ConfirmMultiItem[]>([])
  const multiConfirmText = ref('OK')
  const multiCancelText = ref('Cancel')
  const multiDanger = ref(false)
  let onMultiConfirmCb: (() => void) | null = null
  let onMultiCancelCb: (() => void) | null = null

  function askMulti(opts: ConfirmMultiOptions) {
    multiTitle.value = opts.title
    multiMessage.value = opts.message ?? ''
    multiItems.value = opts.items
    multiConfirmText.value = opts.confirmText ?? 'OK'
    multiCancelText.value = opts.cancelText ?? 'Cancel'
    multiDanger.value = opts.danger ?? false
    onMultiConfirmCb = opts.onConfirm
    onMultiCancelCb = opts.onCancel ?? null
    multiOpen.value = true
  }
  function confirmMulti() {
    multiOpen.value = false
    const cb = onMultiConfirmCb
    onMultiConfirmCb = null; onMultiCancelCb = null
    cb?.()
  }
  function cancelMulti() {
    multiOpen.value = false
    const cb = onMultiCancelCb
    onMultiConfirmCb = null; onMultiCancelCb = null
    cb?.()
  }

  return {
    open, title, message, confirmText, cancelText, danger, ask, confirm, cancel,
    promptOpen, promptTitle, promptMessage, promptPlaceholder, promptValue,
    promptConfirmText, promptCancelText, askInput, confirmPrompt, cancelPrompt,
    multiOpen, multiTitle, multiMessage, multiItems, multiConfirmText, multiCancelText, multiDanger,
    askMulti, confirmMulti, cancelMulti,
  }
})
