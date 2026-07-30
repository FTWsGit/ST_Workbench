import { ref, nextTick } from 'vue'

/**
 * 双击重命名：双击进入编辑模式，<input> 替换标签，blur/Enter 提交，Esc 取消。
 * 每个调用方为不同的编辑目标实例化一次（如块名和组名各一个实例）。
 * `getCurrentName`/`onCommit` 为回调，保持域无关性。
 */
export function useInlineRename<T>(opts: {
  getCurrentName: (id: T) => string
  onCommit: (id: T, newName: string) => void
}) {
  const editingId = ref<T | null>(null)
  const inputRef = ref<HTMLInputElement | null>(null)

  /** 绑定编辑模式 <input> 的 :ref。挂载后自动聚焦并全选文本。 */
  function setInputRef(el: any) {
    if (el) {
      inputRef.value = el as HTMLInputElement
      nextTick(() => {
        const input = inputRef.value
        if (input) {
          input.focus()
          input.select()
        }
      })
    }
  }

  function start(id: T) {
    editingId.value = id
  }

  /** blur/Enter 提交。空输入（仅空白字符）视为取消重命名。 */
  function finish(id: T, e: Event) {
    const input = e.target as HTMLInputElement
    const newName = input.value.trim()
    if (newName) opts.onCommit(id, newName)
    editingId.value = null
    inputRef.value = null
  }

  function cancel() {
    editingId.value = null
    inputRef.value = null
  }

  return { editingId, getCurrentName: opts.getCurrentName, setInputRef, start, finish, cancel }
}
