import type { ScriptTree, Script } from '../types'
import { useScriptList } from './useScriptList'

/**
 * tavern_helper 脚本树 CRUD 的薄包装，委托给泛型 useScriptList。
 * 保留旧接口（addScriptTree / deleteScriptTree / reorderScriptTree）以兼容现有调用方。
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
  const { t } = options

  const list = useScriptList<ScriptTree>(getScripts, {
    idPrefix: 'th_',
    createScript: (id): Script => ({
      type: 'script',
      enabled: true,
      name: t('tavern.sidebar.defaultScriptName'),
      id,
      content: '',
      info: '',
      button: { enabled: false, buttons: [] },
      data: {},
      export_with: { data: true, button: true },
    }),
    markDirty: options.markDirty,
    showToast: options.showToast,
    t: options.t,
    loadFirstMessageKey: options.loadFirstMessageKey,
  })

  return {
    addScriptTree: list.add,
    deleteScriptTree: list.remove,
    reorderScriptTree: list.reorder,
  }
}
