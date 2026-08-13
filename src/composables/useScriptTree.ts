import type { Script } from '../types';
import { useScriptList } from './useScriptList';

/**
 * tavern_helper 脚本 CRUD 的薄包装，委托给泛型 useScriptList。
 * 保留旧接口（addScriptTree / deleteScriptTree / reorderScriptTree）以兼容现有调用方。
 * 干净层是扁平 Script[]（ScriptFolder 已在 api 边界折叠成组），新建脚本直接就是一条 Script。
 */
export function useScriptTree(
  getScripts: () => Script[] | null | undefined,
  options: {
    markDirty?: () => void;
    showToast: (msg: string) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    loadFirstMessageKey?: string;
    defaultPlacement?: number[];
  }
) {
  const { t } = options;

  const list = useScriptList<Script>(getScripts, {
    idPrefix: 'th_',
    createScript: (id): Script => ({
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
  });

  return {
    addScriptTree: list.add,
    deleteScriptTree: list.remove,
    reorderScriptTree: list.reorder,
  };
}
