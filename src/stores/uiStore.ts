import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS, FONT_OPTIONS } from '../types'
import { useI18n } from '../composables/useI18n'

/**
 * Global UI state singleton. Owns:
 *   - settings (font/colors/panel widths/language/FAB position)
 *   - toast notifications
 *   - i18n t() function
 *   - settings modal open flag (global — settings aren't per-domain)
 *   - main panel open flag (the whole ST_Workbench floating panel)
 *
 * Was a plain composable (composables/useUiState.ts). Now a real Pinia store ('ui') — any
 * store/component calls `useUiStore()` directly and Pinia guarantees they all share one
 * instance. `useI18n(settings)` is unchanged — still called inside this setup, reading off
 * the `settings` ref owned here.
 */
export const useUiStore = defineStore('ui', () => {
  const settings = ref<Settings>(loadSettings())

  const cssVars = computed(() => {
    const fm = FONT_OPTIONS.find(f => f.name === settings.value.editorFontFamily)
    return {
      '--wb-fs': settings.value.editorFontSize + 'px',
      '--wb-ff': fm ? fm.value : FONT_OPTIONS[0].value,
      ...Object.fromEntries(Object.entries(settings.value.syntaxColors).map(([k, v]) => ['--' + k, v])),
    }
  })

  // Main panel open flag — the entire ST_Workbench floating panel. Global, not per-domain.
  const panelOpen = ref(false)

  // Settings modal open flag — global, not per-domain. Settings (font/language/colors) apply
  // to the whole app, not just the preset editor, so the open/close state lives here.
  const settingsOpen = ref(false)

  function loadSettings(): Settings {
    try {
      const s = localStorage.getItem('st-wb-settings')
      if (s) {
        const p = JSON.parse(s)
        return {
          ...DEFAULT_SETTINGS, ...p,
          syntaxColors: { ...DEFAULT_SETTINGS.syntaxColors, ...(p.syntaxColors || {}) },
        }
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }
  function saveSettings() { localStorage.setItem('st-wb-settings', JSON.stringify(settings.value)) }

  // useI18n reads off the same `settings` ref this store owns — language is just another
  // Settings field, persisted through the loadSettings/saveSettings path above, not a second
  // source of truth.
  const { t, currentLocale } = useI18n(settings)

  function resetSettings() {
    settings.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    saveSettings()
    showToast(t('shared.toast.settingsReset'))
  }

  const toastMsg = ref('')
  const toastVisible = ref(false)
  let toastTimer: ReturnType<typeof setTimeout>
  function showToast(msg: string, ms = 2500) {
    toastMsg.value = msg
    toastVisible.value = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, ms)
  }

  return { settings, cssVars, panelOpen, settingsOpen, loadSettings, saveSettings, resetSettings, toastMsg, toastVisible, showToast, t, currentLocale }
})
