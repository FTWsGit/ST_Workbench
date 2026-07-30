import type { RegexScript } from '../../types'
import type { LocaleKey } from '../../i18n'

/** 正则三件套（RegexSidebar/RegexContentEditor/RegexSettingsForm）共享的 props：数据源 + CRUD 回调，
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

export interface RegexSidebarProps extends RegexTrioProps {
  onAdd: () => string | null
  onDelete: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number, after: boolean) => void
  sidebarWidth: number
  /** 拖拽 pointermove 实时回调（只做宽度更新，不持久化，避免每像素写 localStorage 卡顿）。 */
  onSidebarWidthChange: (w: number) => void
  /** 拖拽结束（pointerup）回调，调用方在此做持久化。 */
  onSidebarWidthCommit: () => void
  /** 组件有两个根节点（<aside> + 拖拽条），父级 :class 到不了 <aside>，需显式传。 */
  mobileDrawerOpen?: boolean
}

export interface RegexContentEditorProps extends RegexTrioProps {
  editorFontSize: number
  editorFontFamily: string
}

export type RegexSettingsFormProps = RegexTrioProps
