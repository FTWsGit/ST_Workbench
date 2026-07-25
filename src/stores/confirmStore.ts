import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Generic modal-based confirm/prompt store, domain-agnostic (see PROJECT_HANDOFF.md 架构总览 1).
 *
 * Two independent flows, both rendered by Modals.vue:
 *  - ask()/confirm()/cancel(): "are you sure" style — title + message (message allows simple
 *    HTML like <strong>) + confirm/cancel button labels + optional onCancel (for callers that
 *    need to revert some UI state, e.g. App.vue snapping a <select> back to its previous value
 *    when the user cancels a preset switch). `danger` (default true) switches the confirm button
 *    to the red/danger style — most existing callers are delete-style actions, but e.g. "switch
 *    preset" isn't destructive so passes false.
 *  - askInput()/confirmPrompt()/cancelPrompt(): single-line text input + confirm callback that
 *    receives the trimmed value. Replaces window.prompt(), which — like window.confirm() — is
 *    unreliable inside TauriTavern's WebView2 host (see hostEnv.ts's doc comment for the general
 *    iframe/top-document story; native window.confirm/prompt/alert are a separate, host-specific
 *    problem on top of that one).
 *
 * RULE: nothing in this codebase should call getHostWindow().confirm()/.prompt() — always go
 * through ask()/askInput() instead, even for one-off "are you sure" checks.
 *
 * Both flows are deliberately flat state on one store rather than a stack/queue — this app never
 * needs to show two confirms at once, and a queue would be speculative complexity for a UI this
 * size. If that ever changes, this is the file to revisit.
 *
 * 第三个 flow，askMulti()，就是"这变了"的那次：面板关闭时要汇总展示"哪几份文档还有未保存改动"
 * （TODO.md 1.6——工作区之间背景保活，用户很容易忘记切走的那个工作区还有东西没存），这是一份
 * *列表*，不是 ask() 那种单条 title+message 就能表达的东西，硬塞进 ask() 只会逼调用方自己拼
 * HTML 列表塞进 message 字符串里，还得自己转义。加第三个独立 flow（多一份状态+多一个 Modals.vue
 * 分支）比让 ask() 长出一个可选的 items 字段更清楚——三个 flow 各自的字段命名不会互相打架，
 * Modals.vue 判断"现在该显示哪个"也不用去猜某个字段是不是同时被两种用法复用。仍然是扁平状态，
 * 不是队列：跟上面两个 flow 一样的假设——这个体量的应用不会同时冒出两个需要排队的确认框。
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
  message: string // 允许简单 HTML（<strong>之类）——调用方自己负责转义任何插入的用户数据，见 utils.ts 的 esc()
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
