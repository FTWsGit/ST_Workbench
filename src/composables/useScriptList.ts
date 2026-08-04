/**
 * 通用的脚本列表 CRUD composable，供 presetStore / characterStore 复用。
 *
 * 泛型 `<T>` 是脚本元素类型（RegexScript / Script 等）。参数化的差异点：
 *   - `idPrefix`：新 id 前缀（'regex_' / 'th_'），防撞其他域的 id。
 *   - `createScript(id)`：工厂，返回一个填好默认值的新脚本对象。调用方决定字段结构。
 *   - `idOf(script)`：从脚本对象取 id 的 getter（默认读 `.id`）。
 *
 * @param getScripts - 获取 scripts 数组的 getter（返回可变数组的引用）
 * @param options.markDirty - 标记脏数据的函数（可选）
 * @param options.showToast - 显示 toast 的函数
 * @param options.t - i18n 翻译函数
 * @param options.loadFirstMessageKey - "请先加载"的翻译 key（默认 'preset.toast.loadFirst'）
 */
export function useScriptList<T extends { id: string }>(
  getScripts: () => T[] | null | undefined,
  options: {
    idPrefix: string
    createScript: (id: string) => T
    markDirty?: () => void
    showToast: (msg: string) => void
    t: (key: string, params?: any) => string
    loadFirstMessageKey?: string
  }
) {
  const { idPrefix, createScript, markDirty, showToast, t } = options
  const loadFirstKey = options.loadFirstMessageKey || 'preset.toast.loadFirst'

  function genId(): string {
    return idPrefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  function add(): string | null {
    const scripts = getScripts()
    if (!scripts) { showToast(t(loadFirstKey)); return null }

    const id = genId()
    scripts.push(createScript(id))
    markDirty?.()
    return id
  }

  function remove(id: string) {
    const scripts = getScripts()
    if (!scripts) return
    const i = scripts.findIndex(s => s.id === id)
    if (i >= 0) {
      scripts.splice(i, 1)
      markDirty?.()
    }
  }

  function reorder(fromIdx: number, toIdx: number, after: boolean) {
    const scripts = getScripts()
    if (!scripts) return
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= scripts.length || toIdx >= scripts.length) return
    const item = scripts.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    scripts.splice(ni, 0, item)
    markDirty?.()
  }

  return { add, remove, reorder }
}
