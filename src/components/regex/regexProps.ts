import type { RegexScript } from '../../types'
import type { LocaleKey } from '../../i18n'

/** 正则三件套（RegexSidebar/RegexContentEditor/RegexSettingsForm）共享的 props 形状——数据源 +
 *  CRUD 回调，不再假设背后一定是 presetStore（TODO.md 阶段0「正则三件套组件参数化改造」）。哪个
 *  工作区在用，就把哪个工作区自己 store 的数据/方法传进来；预设工作区目前是唯一的调用方，见
 *  App.vue/EditorShell.vue/SettingsDock.vue 这三处挂载点怎么从 presetStore 组出这些 props。
 *  以后角色工作区的 characterSidebarMode==='regex' 子模式（阶段2）会指向
 *  characterStore.regexScripts，多加一份差不多的组装逻辑，这三个组件本身不用再改。
 *
 *  tabsStore 相关的调用（open/close/renameTab/activeTab/settingsDockOpen）故意不在这些 props
 *  里——tabsStore 本身就是跨 domain 共享的全局单例 store，不是"数据源"，三个组件继续直接
 *  `useTabsStore()` 就行，domain 参数永远写死 'regex'（这跟背后是哪个 store 无关）。唯一例外是
 *  workspace：`tabsStore.open()` 需要知道打开的标签归属哪个工作区，这个只有调用方知道，所以单独
 *  当一个字段传进来。
 *
 *  t（i18n）是 stores/uiStore.ts 那份全局共享 UI 状态的一部分（真正的 Pinia 单例 store，
 *  TODO-useUiState.md 已落地）。这三个组件不自己 useUiStore()，而是由调用方把 t 当 props 传
 *  进来——跟 scripts/onAdd 等数据源字段是同一个理由：参数化后不假设背后一定是哪个 store
 *  （预设工作区传 presetStore.t，以后角色工作区会传 characterStore.t）。 */
export interface RegexTrioProps {
  scripts: RegexScript[]
  /** 这一组正则标签打开 tab 时归属哪个顶层工作区（tabsStore.open() 需要，见 OpenTab.workspace
   *  的 doc comment），跟 domain 是两个维度——这个组件的 domain 永远是 'regex'，workspace 却
   *  随调用方而变。 */
  workspace: string
  t: (key: LocaleKey, params?: Record<string, string | number>) => string
}

export interface RegexSidebarProps extends RegexTrioProps {
  onAdd: () => string | null
  onDelete: (id: string) => void
  onReorder: (fromIdx: number, toIdx: number, after: boolean) => void
  sidebarWidth: number
  /** 拖拽过程中每次 pointermove 都会调（usePanelResize 的 setWidth），只做便宜的实时宽度更新，
   *  不在这里做持久化——拖到一半每像素都写一次 localStorage 会卡（跟 Modals.vue 字号拖拽条 draft
   *  的理由一样）。真正落盘的时机见 onSidebarWidthCommit。 */
  onSidebarWidthChange: (w: number) => void
  /** 拖拽结束（pointerup）时调一次，调用方在这里做"实际持久化"（比如 presetStore.saveSettings()）。
   *  是否需要区分"实时更新"和"落盘"两个回调而不是合并成一个，取决于调用方自己的 setWidth 是否
   *  已经足够便宜——现在拆开是为了原样保留原实现的这个优化，不是本组件本身的强制要求。 */
  onSidebarWidthCommit: () => void
  /** 见 PresetSidebar.vue 同名 prop 的 doc comment：这个组件模板有两个根节点（<aside> + 末尾
   *  的 .wb-resize-handle），父组件的 :class 到不了 <aside>，只能显式传。 */
  mobileDrawerOpen?: boolean
}

export interface RegexContentEditorProps extends RegexTrioProps {
  editorFontSize: number
  editorFontFamily: string
}

export type RegexSettingsFormProps = RegexTrioProps
