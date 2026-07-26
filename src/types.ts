export interface PresetBlock {
  identifier: string
  name: string
  content: string
  role: 'system' | 'user' | 'assistant'
  system_prompt: boolean
  marker: boolean
  [k: string]: any
}

export interface OrderItem {
  identifier: string
  enabled: boolean
  [k: string]: any
}

export interface OrderGroup {
  id: string
  _gid: string
  name: string
  collapsed: boolean
  enabled: boolean
  children: OrderItem[]
}

export type OrderNode = OrderItem | OrderGroup

export interface FlatNode {
  ref: OrderNode
  parent: OrderNode[]
  parentIdx: number
  depth: number
  isGroup: boolean
}

export interface PresetData {
  openai_max_context: number;
  openai_max_tokens: number;

  /** 每次生成几个回复 */
  n: number;

  /** 流式传输 */
  stream_openai: boolean;

  temperature: number;
  frequency_penalty: number;
  presence_penalty: number;
  top_p: number;
  repetition_penalty: number;
  min_p: number;
  top_k: number;
  top_a: number;

  /** -1 表示随机 */
  seed: number;

  /** 压缩系统消息: 将连续的系统消息合并为一条消息 */
  squash_system_messages: boolean;

  prompts: PresetBlock[]
  prompt_order: { order: OrderItem[]; [k: string]: any }[]
  [k: string]: any
}

export interface PreviewSegment {
  text: string
  added: boolean // true = 相对该块原始 content 新增/被替换出来的文本（比如宏被解析后的结果），用于高亮
}

export interface PreviewMessage {
  role: string
  tokens: number
  identifier: string
  segments: PreviewSegment[]
}

export interface PreviewBlockGroup {
  id: string
  name: string
  isMarker: boolean
  messages: PreviewMessage[]
}

export interface SearchResult {
  blockId: string
  blockName: string
  line: number
  col: number
  context: string
  ms: number
  ml: number
}

export interface VarOp {
  blockId: string
  blockName: string
  type: 'setvar' | 'addvar' | 'get'
  varName: string
  varValue: string
  line: number
  col: number
  pos: number
  ordIdx: number
}

export interface SyntaxColors {
  'hl-b': string; 'hl-k': string; 'hl-s': string; 'hl-v': string
  'hl-c': string; 'hl-cm': string; 'hl-m': string
  'hl-sq': string; 'hl-dq': string; 'hl-ab': string; 'hl-sb': string
}

export interface Settings {
  editorFontSize: number
  editorFontFamily: string
  syntaxColors: SyntaxColors
  sidebarWidth: number
  varPanelWidth: number
  previewWidth: number
  varPanelFloat: boolean
  previewFloat: boolean
  settingsDockWidth: number
  settingsDockFloat: boolean
  language: 'zh-CN' | 'en'
  /** FAB's explicit top-left position (px, in viewport coords — see App.vue's onFabPointerDown),
   *  set the first time the user long-press-drags it. `null` means "use the CSS default"
   *  (bottom:24px/right:24px, see .wb-fab in main.css), which also stays responsive to the
   *  mobile safe-area media query — an explicit saved position deliberately overrides that. */
  fabPos: { x: number; y: number } | null
}

export const DEFAULT_SETTINGS: Settings = {
  editorFontSize: 15,
  editorFontFamily: 'Consolas',
  syntaxColors: {
    'hl-b': '#58b8c0', 'hl-k': '#a078c0', 'hl-s': '#555570',
    'hl-v': '#c8a045', 'hl-c': '#68b868', 'hl-cm': '#555570',
    'hl-m': '#6090c0', 'hl-sq': '#c89850', 'hl-dq': '#78b0c0',
    'hl-ab': '#60a870', 'hl-sb': '#d08a5c',
  },
  sidebarWidth: 340,
  varPanelWidth: 360,
  previewWidth: 640,
  varPanelFloat: true,
  previewFloat: true, 
  settingsDockWidth: 320,
  settingsDockFloat: true,
  language: 'zh-CN',
  fabPos: null,
}

/** Cap on how many search-result rows SearchPanel.vue renders in the results list — doSearch()
 *  in store.ts still collects every match (used for prev/next/replace-all), this only limits the
 *  DOM list. Lives here instead of a local const in SearchPanel.vue so there's one source of
 *  truth if this ever needs to become a user setting. */
export const SEARCH_MAX = 200

export const FONT_OPTIONS = [
  { name: 'Consolas', value: "'Consolas',monospace" },
  { name: 'JetBrains Mono', value: "'JetBrains Mono','Fira Code',monospace" },
  { name: 'Fira Code', value: "'Fira Code',monospace" },
  { name: 'Source Code Pro', value: "'Source Code Pro',monospace" },
  { name: 'IBM Plex Mono', value: "'IBM Plex Mono',monospace" },
  { name: 'Ubuntu Mono', value: "'Ubuntu Mono',monospace" },
]

export const SYNTAX_LABEL_KEYS = {
  'hl-b': 'syntax.hl-b', 'hl-k': 'syntax.hl-k', 'hl-s': 'syntax.hl-s',
  'hl-v': 'syntax.hl-v', 'hl-c': 'syntax.hl-c', 'hl-cm': 'syntax.hl-cm',
  'hl-m': 'syntax.hl-m', 'hl-sq': 'syntax.hl-sq', 'hl-dq': 'syntax.hl-dq',
  'hl-ab': 'syntax.hl-ab', 'hl-sb': 'syntax.hl-sb',
} as const

export interface RegexScript {
  id: string
  scriptName: string
  findRegex: string
  replaceString: string
  trimStrings: string[]
  placement: number[]
  disabled: boolean
  markdownOnly: boolean   // 仅影响显示
  promptOnly: boolean     // 仅影响后端提示词
  runOnEdit: boolean
  substituteRegex: number // 0 不替换 / 1 替换(原始) / 2 替换(转义)
  minDepth: number | null
  maxDepth: number | null
  [k: string]: any
}

/**No value 4 here, decided by SillyTavern-v1.18*/
export const REGEX_PLACEMENT_OPTIONS = [
  { value: 1, labelKey: 'regex.placement.userInput' },
  { value: 2, labelKey: 'regex.placement.aiOutput' },
  { value: 3, labelKey: 'regex.placement.quickCommand' },
  { value: 5, labelKey: 'regex.placement.worldInfo' },
  { value: 6, labelKey: 'regex.placement.reasoning' },
] as const

export const REGEX_SUBSTITUTE_OPTIONS = [
  { value: 0, labelKey: 'regex.substitute.none' },
  { value: 1, labelKey: 'regex.substitute.raw' },
  { value: 2, labelKey: 'regex.substitute.escaped' },
] as const

import defaultPreset from '../default/default_preset.json'
export const DEFAULT_PRESET = defaultPreset as PresetData  

/* ====== 世界书（Worldbook / Lorebook）====== 见 TODO.md 阶段1「数据结构」。
 * 工作层结构，跟 ST 原生 STWorldbook（entries 是 Record<uid, entry>）双向转换在 api/worldbookApi.ts
 * 里完成——store/组件只认这份数组形状的 WorldbookEntry[]，不知道原生格式长什么样。
 *
 * _gid/_gname/_gcollapsed/_genabled/_gidx 是「文件夹式分组」的持久化载体，跟 preset 域
 * OrderItem 上同名字段是同一个模式（见 PresetStore.ts importOrderWithGroups/exportOrder）：
 * 分组是这个工具自己发明的组织方式，ST 原生 STWorldbookEntry 没有这个概念，存成未知字段让 ST
 * 原样忽略、下次加载时我们自己再读回来重建分组树。 */
export interface WorldbookEntry {
  uid: number
  comment: string
  content: string
  /** 在 UI 里显示的顺序——由 worldbookStore 在每次保存前根据 order 树（含展开折叠组）重新计算
   *  写回，不是用户直接编辑的字段。 */
  displayIndex: number

  keys: string[]
  keysecondary: string[]
  selective: boolean
  selectiveLogic: 0 | 1 | 2 | 3

  /** 三种激活方式互斥：constant=恒定激活，vectorized=向量化激活，两者都 false 时代表关键词激活
   *  （keyWord，ST 原生没有这个字段，是转换时派生出来的工作层字段，方便设置表单直接三选一）。 */
  constant: boolean
  keyWord: boolean
  vectorized: boolean

  disabled: boolean

  position: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
  depth: number
  order: number
  role: 0 | 1 | 2 | null

  probability: number
  useProbability: boolean
  excludeRecursion: boolean
  preventRecursion: boolean
  delayUntilRecursion: boolean | number

  scanDepth: number | null
  /** null = 跟随全局设置（不是 'same_as_global' 字符串——2026-07 修正，ST 原生就是这么存的，
   *  工作层直接照抄没有转换）。 */
  caseSensitive: boolean | null
  matchWholeWords: boolean | null

  group: string
  groupPrioritized: boolean
  groupWeight: number

  sticky: number | null
  cooldown: number | null
  delay: number | null

  /** 分组持久化字段，见本接口顶部 doc comment。 */
  _gid?: string
  _gname?: string
  _gcollapsed?: boolean
  _genabled?: boolean
  _gidx?: number

  [k: string]: any
}

export interface Worldbook {
  name: string
  entries: WorldbookEntry[]
}

/** 2026-07 修正：之前这份映射跟 ST 原生 position 枚举值对不上（真实映射见 PROJECT.md「关键设计
 *  要点」第5条），已按正确顺序重排，并补上之前漏掉的 outlet（7）。 */
export const WORLDBOOK_POSITION_OPTIONS = [
  { value: 0, labelKey: 'worldbook.position.beforeChar' },
  { value: 1, labelKey: 'worldbook.position.afterChar' },
  { value: 2, labelKey: 'worldbook.position.beforeAuthorsNote' },
  { value: 3, labelKey: 'worldbook.position.afterAuthorsNote' },
  { value: 4, labelKey: 'worldbook.position.atDepth' },
  { value: 5, labelKey: 'worldbook.position.beforeExample' },
  { value: 6, labelKey: 'worldbook.position.afterExample' },
  { value: 7, labelKey: 'worldbook.position.outlet' },
] as const

export const WORLDBOOK_LOGIC_OPTIONS = [
  { value: 0, labelKey: 'worldbook.logic.andAny' },
  { value: 1, labelKey: 'worldbook.logic.notAll' },
  { value: 2, labelKey: 'worldbook.logic.notAny' },
  { value: 3, labelKey: 'worldbook.logic.andAll' },
] as const

export const WORLDBOOK_ROLE_OPTIONS = [
  { value: null as number | null, labelKey: 'worldbook.role.default' },
  { value: 0, labelKey: 'worldbook.role.system' },
  { value: 1, labelKey: 'worldbook.role.user' },
  { value: 2, labelKey: 'worldbook.role.assistant' },
] as const
