import type { RegexScript } from '../types'
import { useScriptList } from './useScriptList'

/**
 * 正则脚本 CRUD 的薄包装，委托给泛型 useScriptList。
 * 保留旧接口（addRegexScript / deleteRegexScript / reorderRegexScript）以兼容现有调用方。
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
  const defaultPlacement = options.defaultPlacement || [2]

  const list = useScriptList<RegexScript>(getScripts, {
    idPrefix: 'regex_',
    createScript: (id) => ({
      id,
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
    }),
    markDirty: options.markDirty,
    showToast: options.showToast,
    t: options.t,
    loadFirstMessageKey: options.loadFirstMessageKey,
  })

  return {
    addRegexScript: list.add,
    deleteRegexScript: list.remove,
    reorderRegexScript: list.reorder,
  }
}
