import type { RegexScript } from '../types'

/**
 * 通用的正则脚本管理 composable，供 presetStore 和 characterStore 复用。
 *
 * @param getScripts - 获取 regex scripts 数组的 getter（返回可变数组的引用）
 * @param options.markDirty - 标记脏数据的函数（可选）
 * @param options.showToast - 显示 toast 的函数
 * @param options.t - i18n 翻译函数
 * @param options.loadFirstMessageKey - "请先加载"的翻译 key（默认 'preset.toast.loadFirst'）
 * @param options.defaultPlacement - 新脚本的默认 placement（默认 [2]）
 */
export function useRegexScripts(
  getScripts: () => RegexScript[] | null | undefined,
  options: {
    markDirty?: () => void
    showToast: (msg: string) => void
    t: (key: string, params?: any) => string
    loadFirstMessageKey?: string
    defaultPlacement?: number[]
  }
) {
  const { markDirty, showToast, t } = options
  const loadFirstKey = options.loadFirstMessageKey || 'preset.toast.loadFirst'
  const defaultPlacement = options.defaultPlacement || [2]

  function genRegexId(): string {
    return 'regex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  function addRegexScript(): string | null {
    const scripts = getScripts()
    if (!scripts) { showToast(t(loadFirstKey)); return null }

    const script: RegexScript = {
      id: genRegexId(),
      scriptName: 'New Regex',
      findRegex: '',
      replaceString: '',
      trimStrings: [],
      placement: defaultPlacement,
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    }
    scripts.push(script)
    markDirty?.()
    return script.id
  }

  function deleteRegexScript(id: string) {
    const scripts = getScripts()
    if (!scripts) return
    const i = scripts.findIndex(r => r.id === id)
    if (i >= 0) {
      scripts.splice(i, 1)
      markDirty?.()
    }
  }

  function reorderRegexScript(fromIdx: number, toIdx: number, after: boolean) {
    const scripts = getScripts()
    if (!scripts) return
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= scripts.length || toIdx >= scripts.length) return
    const item = scripts.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    scripts.splice(ni, 0, item)
    markDirty?.()
  }

  return {
    addRegexScript,
    deleteRegexScript,
    reorderRegexScript,
  }
}
