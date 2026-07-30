import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Settings } from '../types'
import { DEFAULT_SETTINGS, FONT_OPTIONS } from '../types'
import { useI18n } from '../composables/useI18n'

/**
 * 全局 UI 状态单例。拥有：
 *   - settings（字体/颜色/面板宽度/语言/FAB 位置）
 *   - toast 通知
 *   - i18n t() 函数
 *   - settings 弹窗开关（全局 —— settings 不是按 domain 分的）
 *   - 主面板开关（整个 ST_Workbench 浮动面板）
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

  // 主面板开关 —— 整个 ST_Workbench 浮动面板。全局，不按 domain 分。
  const panelOpen = ref(false)

  // Settings 弹窗开关 —— 全局，不按 domain 分。
  const settingsOpen = ref(false)

  // MetaPanel 打开状态 —— 横跨 preset/character 两个工作区，不属于某个 domain store。
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

  // useI18n 读取此 store 持有的同一个 `settings` ref —— language 只是另一个 Settings 字段，
  // 通过 loadSettings/saveSettings 路径读写，不是第二个真相来源。
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
