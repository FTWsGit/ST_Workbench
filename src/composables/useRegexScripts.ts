import type { RegexPlacement, RegexScript } from '../types';
import { useScriptList } from './useScriptList';

/**
 * 正则脚本 CRUD 的薄包装，委托给泛型 useScriptList。
 * 保留旧接口（addRegexScript / deleteRegexScript / reorderRegexScript）以兼容现有调用方。
 */
export function useRegexScripts(
  getScripts: () => RegexScript[] | null | undefined,
  options: {
    markDirty?: () => void;
    showToast: (msg: string) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    loadFirstMessageKey?: string;
    defaultPlacement?: RegexPlacement[];
  }
) {
  const defaultPlacement = options.defaultPlacement || (['ai_output'] as RegexPlacement[]);

  const list = useScriptList<RegexScript>(getScripts, {
    idPrefix: 'regex_',
    createScript: (id) => ({
      id,
      name: 'New Regex',
      findRegex: '',
      replaceString: '',
      trimStrings: [],
      placement: [...defaultPlacement],
      enabled: true,
      scope: ['displayOnly', 'promptOnly'],
      runOnEdit: false,
      substituteRegex: 'none',
      depth: { minDepth: null, maxDepth: null },
    }),
    markDirty: options.markDirty,
    showToast: options.showToast,
    t: options.t,
    loadFirstMessageKey: options.loadFirstMessageKey,
  });

  return {
    addRegexScript: list.add,
    deleteRegexScript: list.remove,
    reorderRegexScript: list.reorder,
  };
}
