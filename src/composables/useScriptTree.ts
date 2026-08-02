import type { ScriptTree, Script } from '../types'

/**
 * 通用的 tavern_helper 脚本树管理 composable，供 presetStore 和 characterStore 复用。
 * 抄 useRegexScripts 的 CRUD 模式，函数名换成 ScriptTree 系列。
 *
 * @param getScripts - 获取 tavern_helper.scripts 数组的 getter（返回可变数组的引用）
 * @param options.markDirty - 标记脏数据的函数（可选）
 * @param options.showToast - 显示 toast 的函数
 * @param options.t - i18n 翻译函数
 * @param options.loadFirstMessageKey - "请先加载"的翻译 key（默认 'preset.toast.loadFirst'）
 * @param options.defaultPlacement - 新脚本的默认 placement（默认 [2]，保留给未来扩展用，当前 Script 没有该字段）
 */
export function useScriptTree(
  getScripts: () => ScriptTree[] | null | undefined,
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

  /** 独立前缀 'th_' 防撞其他域的 id（regex_ / g_ 等）。 */
  function genScriptTreeId(): string {
    return 'th_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  }

  function addScriptTree(): string | null {
    const scripts = getScripts()
    if (!scripts) { showToast(t(loadFirstKey)); return null }

    const script: Script = {
      type: 'script',
      enabled: true,
      name: t('tavern.sidebar.defaultScriptName'),
      id: genScriptTreeId(),
      content: '',
      info: '',
      button: { enabled: false, buttons: [] },
      data: {},
      export_with: { data: true, button: true },
    }
    scripts.push(script)
    markDirty?.()
    return script.id
  }

  function deleteScriptTree(id: string) {
    const scripts = getScripts()
    if (!scripts) return
    const i = scripts.findIndex(s => s.id === id)
    if (i >= 0) {
      scripts.splice(i, 1)
      markDirty?.()
    }
  }

  function reorderScriptTree(fromIdx: number, toIdx: number, after: boolean) {
    const scripts = getScripts()
    if (!scripts) return
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= scripts.length || toIdx >= scripts.length) return
    const item = scripts.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    scripts.splice(ni, 0, item)
    markDirty?.()
  }

  return {
    addScriptTree,
    deleteScriptTree,
    reorderScriptTree,
  }
}
