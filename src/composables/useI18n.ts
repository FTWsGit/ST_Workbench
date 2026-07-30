import { computed, type Ref } from 'vue'
import { locales, type LocaleKey } from '../i18n'
import type { Settings } from '../types'

/**
 * i18n 封装，使用与 uiStore 相同的 settings ref（单一数据源）。
 * uiStore 展开此 composable 的返回值，presetStore 再转发一层，使 `store.t()` 在各处可用。
 */
export function useI18n(settings: Ref<Settings>) {
  const table = computed(() => locales[settings.value.language])

  /**
   * 获取翻译字符串。key 须存在 zh-CN.ts 中（LocaleKey 派生自它）。params 填充命名占位符如 `{msg}`。
   * 降级顺序：当前语言 → zh-CN → 原始 key。
   */
  function t(key: LocaleKey, params?: Record<string, string | number>): string {
    const str = table.value[key] ?? locales['zh-CN'][key] ?? key
    if (!params) return str
    return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }

  return { t, currentLocale: computed(() => settings.value.language) }
}
