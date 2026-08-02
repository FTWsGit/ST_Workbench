import type { ScriptTree } from '../../types'
import type { LocaleKey } from '../../i18n'

/** tavern 脚本三件套（TavernContentEditor/TavernSettingsForm）共享的 props：数据源 +
 *  i18n。不假设背后一定是哪个 store，由调用方（EditorShell/SettingsDock）按 workspace
 *  从 presetStore/characterStore 的 tavernHelper.scripts 组装传入。
 *  tabsStore 是跨 domain 全局单例，组件内直接 useTabsStore()，domain 固定为 'tavern'；
 *  唯一例外是 workspace，由调用方传入（tabsStore.open() 需要）。 */
export interface TavernTrioProps {
  scripts: ScriptTree[]
  /** 标签归属的顶层工作区（tabsStore.open() 需要），与 domain='tavern' 正交，随调用方变化。 */
  workspace: string
  t: (key: LocaleKey, params?: Record<string, string | number>) => string
}

export interface TavernContentEditorProps extends TavernTrioProps {
  editorFontSize: number
  editorFontFamily: string
}

export type TavernSettingsFormProps = TavernTrioProps
