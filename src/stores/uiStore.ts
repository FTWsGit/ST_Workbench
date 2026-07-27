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

  // MetaPanel（TODO.md 2.5b）打开状态——横跨 preset/character 两个工作区（MetaPanel.vue 自己按
  // tabsStore.activeWorkspace 查 META_FORMS 表决定渲染哪个表单），不属于任何一个 domain store，
  // 跟 copyPanelOpen（纯 preset 专属，留在 presetStore 里）不是一回事，理由跟 panelOpen/
  // settingsOpen 一样：这是"整个 app 的一块 UI 状态"，不是某个 domain 的数据。
  const metaPanelOpen = ref(false)

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

  return { settings, cssVars, panelOpen, settingsOpen, metaPanelOpen, loadSettings, saveSettings, resetSettings, toastMsg, toastVisible, showToast, t, currentLocale }
})
