import { computed, type Ref } from 'vue'
import { locales, type LocaleKey } from '../i18n'
import type { Settings } from '../types'

/**
 * Thin wrapper around the i18n locale tables — takes the *same* `settings` ref that
 * stores/uiStore.ts already owns (language lives on Settings, persisted through the existing
 * localStorage read/write path in uiStore.ts) rather than creating a second source of truth.
 *
 * Usage: uiStore.ts spreads this composable's return value into its own return object, same
 * pattern as everything else in that store — so `store.t(...)` works in every component
 * without a separate import, exactly like `store.showToast(...)`. presetStore forward-spreads
 * it one more level so preset-domain call sites keep working untouched.
 */
export function useI18n(settings: Ref<Settings>) {
  const table = computed(() => locales[settings.value.language])

  /**
   * `key` must exist in zh-CN.ts (LocaleKey is derived from it). `params` fills named
   * placeholders in the string, e.g. `t('toast.saveFailed', { msg: e.message })`
   * against a table entry `'toast.saveFailed': '保存失败：{msg}'`.
   *
   * Fallback order: current language -> zh-CN -> the raw key itself. Falling back to the key
   * (instead of throwing) means a missing translation shows up as an obviously-wrong string
   * in the UI during development rather than crashing the component.
   */
  function t(key: LocaleKey, params?: Record<string, string | number>): string {
    const str = table.value[key] ?? locales['zh-CN'][key] ?? key
    if (!params) return str
    return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
  }

  return { t, currentLocale: computed(() => settings.value.language) }
}
