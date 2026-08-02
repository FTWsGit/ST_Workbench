import type { RegexScript } from '../../types'
import type { LocaleKey } from '../../i18n'

/** 正则三件套（RegexContentEditor/RegexSettingsForm）共享的 props：数据源 + CRUD 回调，
 *  不假设背后一定是某个 store。哪个工作区使用就由哪个工作区的 store 组装这些 props 传入。
 *  tabsStore 是跨 domain 全局单例，组件内直接 useTabsStore()，domain 固定为 'regex'；
 *  唯一例外是 workspace，由调用方传入（tabsStore.open() 需要）。
 *  t（i18n）也由调用方传入，以便不同工作区使用各自 store 的 t 方法。 */
export interface RegexTrioProps {
  scripts: RegexScript[]
  /** 标签归属的顶层工作区（tabsStore.open() 需要），与 domain='regex' 正交，随调用方变化。 */
  workspace: string
  t: (key: LocaleKey, params?: Record<string, string | number>) => string
}

export interface RegexContentEditorProps extends RegexTrioProps {
  editorFontSize: number
  editorFontFamily: string
}

export type RegexSettingsFormProps = RegexTrioProps
