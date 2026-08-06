import type { VarMacroKind, VarScope } from './utils'

/** Tab 路由的"用哪个组件编辑"维度。 */
export type Domain = 'preset' | 'regex' | 'worldbook' | 'character' | 'tavern'

/** Tab 路由的"归哪份文档所有"维度。 */
export type Workspace = 'preset' | 'worldbook' | 'character'

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
  extensions?: { regex_scripts?: RegexScript[]; tavern_helper?: TavernHelper; [k: string]: any }
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

/** 变量宏来源载体类型，决定跳转路由到哪个编辑器。 */
export type VarDomain = 'preset' | 'character' | 'worldbook'

/** 装配管线三层硬编码顺序：WI 先于角色卡字段执行 substituteParams，再装配预设。 */
export type VarAssemblyLayer = 'worldbook' | 'character' | 'preset'

export interface VarOp {
  kind: VarMacroKind
  scope: VarScope
  varName: string
  /** 载体定位——跳转用。 */
  source: {
    domain: VarDomain
    /** preset 名 / 世界书名 / 角色卡名（仅展示，跳转不强依赖）。 */
    fileId: string
    /** preset prompt identifier / worldbook entry uid（String）。character 域用虚拟字段 tab key。 */
    blockId: string
    /** character 域专用：'description'/'scenario'/...；其他域为空。 */
    fieldName?: string
    /** 展示用：preset block name / worldbook entry comment / character 字段名。 */
    blockLabel: string
    line: number
    col: number
    pos: number
  }
  /** 装配顺序——按 (layer, intraOrder) 升序摆放变量引用。 */
  assemblyOrder: {
    layer: VarAssemblyLayer
    /** 同 layer 内的顺序：preset=marker+order 合成；character=字段固定序；worldbook=insertion_order 降序。 */
    intraOrder: number
  }
  /**
   * 此引用所在 block 是否必定进入装配。
   * - preset block：order 树里 enabled && 非折叠组收起。
   * - character 字段：恒 true（角色卡字段始终注入）。
   * - worldbook entry：constant=true 必定触发；关键词/概率/向量化激活皆非必定，为 false。
   * UI 用此字段决定灰度——非必定的引用视觉变暗，但不另加标签。
   */
  certain: boolean
  /** 仅 set/add 携带；其他宏恒为 ''。前端变量追踪暂不显示值，保留以兼容现有 VarOp 形状与未来恢复显示。 */
  varValue: string
}

export interface SyntaxColors {
  'hl-b': string; 'hl-k': string; 'hl-s': string; 'hl-v': string
  'hl-c': string; 'hl-cm': string; 'hl-m': string
  'hl-sq': string; 'hl-dq': string; 'hl-ab': string; 'hl-sb': string
}

/** 右侧面板/工具箱的三种形态：
 *  'docked'  右侧挤开：嵌入布局流，挤开编辑区
 *  'overlay' 右侧悬浮：absolute 盖在右侧边缘，不挤开布局
 *  'float'   完全悬浮：FloatingPanelShell 可拖拽窗口 */
export type PanelMode = 'docked' | 'overlay' | 'float'

export interface Settings {
  editorFontSize: number
  editorFontFamily: string
  syntaxColors: SyntaxColors
  sidebarWidth: number
  varPanelWidth: number
  previewWidth: number
  varPanelFloat: boolean
  previewMode: PanelMode
  toolBoxWidth: number
  toolBoxMode: PanelMode
  agentMode: PanelMode
  agentWidth: number
  settingsDockWidth: number
  settingsDockFloat: boolean
  language: 'zh-CN' | 'en'
  /** FAB 的显式左上角位置（px，视口坐标——见 App.vue 的 onFabPointerDown），
   *  用户首次长按拖拽时设置。`null` 表示"使用 CSS 默认值"
   *  (bottom:24px/right:24px，见 main.css 的 .wb-fab)，默认位置会响应
   *  移动端 safe-area 媒体查询——显式保存的位置会覆盖此行为。 */
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
  previewMode: 'overlay',
  toolBoxWidth: 420,
  toolBoxMode: 'docked',
  agentMode: 'docked',
  agentWidth: 380,
  settingsDockWidth: 320,
  settingsDockFloat: true,
  language: 'zh-CN',
  fabPos: null,
}

/** Cap on how many search-result rows the results list renders — searchFields() 纯函数仍收集每条命中，
 *  this only limits the DOM list. 工具箱 SearchTool.vue 复用。 */
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
  'hl-b': 'shared.syntax.hl-b', 'hl-k': 'shared.syntax.hl-k', 'hl-s': 'shared.syntax.hl-s',
  'hl-v': 'shared.syntax.hl-v', 'hl-c': 'shared.syntax.hl-c', 'hl-cm': 'shared.syntax.hl-cm',
  'hl-m': 'shared.syntax.hl-m', 'hl-sq': 'shared.syntax.hl-sq', 'hl-dq': 'shared.syntax.hl-dq',
  'hl-ab': 'shared.syntax.hl-ab', 'hl-sb': 'shared.syntax.hl-sb',
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

/** tavern_helper 脚本树的单条脚本。button.enabled 控制是否随脚本一起导出按钮区，
 *  buttons 是脚本内嵌的快捷按钮列表。data 留给脚本自定义键值数据，export_with 控制导出范围。
 *  分组字段 _gid/_gname/_gcollapsed/_genabled/_gidx 通过 `[k: string]: any` 塞进 script 里
 *  （跟 RegexScript 的分组字段同模式），顶层 folder 不需要分组字段。
 *  ScriptButton 的字段名跟上游 Js-Slash-Runner 的 zod schema 一致：name 是按钮显示文字，
 *  visible 控制是否在工具栏渲染（false 时仍留在 buttons[] 里只是不渲染）。 */
export interface ScriptButton {
  name: string
  visible: boolean
  [k: string]: any
}

export interface Script {
  type: 'script'
  enabled: boolean
  name: string
  id: string
  content: string
  info: string
  button: { enabled: boolean; buttons: ScriptButton[] }
  data: Record<string, any>
  export_with: { data: boolean; button: boolean }
  [k: string]: any
}

/** tavern_helper 脚本树的顶层 folder——本身就是 folder，不参与 _gid 分组（直接挂树顶层）。 */
export interface ScriptFolder {
  type: 'folder'
  enabled: boolean
  name: string
  id: string
  icon: string
  color: string
  scripts: Script[]
}

export type ScriptTree = Script | ScriptFolder

/** tavern_helper 扩展段。注意：Character.extensions.tavern_helper 用 `variables` 字段名，
 *  PresetData.extensions.tavern_helper 用 `variales`（拼写差异按用户给的保留，不统一）。
 *  类型层统一用本 interface，运行时按 workspace 分派读对应字段名（见 useScriptTree/composable
 *  分派逻辑，类型层不体现这拼写差异）。 */
export interface TavernHelper {
  scripts: ScriptTree[]
  variables: Record<string, any>
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

/* ====== 角色卡（Character）====== 见 TODO.md 阶段2「数据结构」。
 * ST 原生结构是 v1CharData（外层）嵌套 v2CharData（`data` 字段），字段名在两层之间经常不一致
 * （比如 creatorcomment vs data.creator_notes）。工作层这份 Character 是扁平化之后的结构，
 * 双向转换在 api/characterApi.ts 里完成——store/组件只认这份形状，不知道 v1/v2 原生结构长什么样。
 *
 * `greetings`：工作层把 `first_mes`（index 0）和 `alternate_greetings`（其余）合并成一个数组，
 * 只有这一个字段支持拖拽排序（TODO.md 1.2）——拖到 index 0 就等于把某条候选开场白提升为
 * "正式"开场白，转换回原生格式时按下标 0/其余重新拆回两个字段。
 *
 * `depthPrompt`：对应 v2CharData.extensions.depth_prompt（"角色备注"），跟其它大文本框字段一样
 * 走虚拟字段 tab（key 为 `field:depthPrompt`）编辑 `.prompt`，但 `.depth`/`.role` 是数值/枚举，
 * 不适合塞进纯文本编辑器——CharacterContentEditor.vue 给这一个字段单独加一条 meta 栏承载，
 * 不为此专门开一个 SettingsDock 表单（角色卡故意不接 SettingsDock，见 TODO.md 2.4）。 */
export interface Character {
  /** ST 用来定位这个角色的文件名（不含路径，含 .png 后缀）。新建、还没保存过的角色是空字符串，
   *  characterStore 用"是否为空"判断这是不是一个待创建的新角色（对应 api/characterApi.ts
   *  createCharacter() 而不是 editCharacter()）。 */
  avatar: string
  name: string

  /** 七个"大文本框"虚拟字段，见 TODO.md 1.2、CharacterSidebar.vue 的 CHARACTER_FIELDS 常量
   *  （固定顺序展示，不可拖拽，跟 greetings 是两种不同的列表语义）。 */
  description: string
  scenario: string
  mesExample: string
  personality: string
  systemPrompt: string
  postHistoryInstructions: string
  depthPrompt: { prompt: string; depth: number; role: 0 | 1 | 2 }

  /** 开场白：index 0 = 正式开场白（原生 first_mes），其余 = 候选开场白（原生
   *  alternate_greetings）。仅这个数组支持拖拽排序，见本接口顶部 doc comment。 */
  greetings: string[]

  /** 角色 Meta（CharacterMetaForm.vue，见 TODO.md 2.5b）专属字段，跟上面的"创作内容"字段分开
   *  归类，纯粹是方便阅读——工作层没有强制这种分组，取值都是扁平字段。 */
  creator: string
  creatorNotes: string
  version: string
  tags: string[]
  talkativeness: number
  fav: boolean
  /** 绑定的世界书名字，对应 v2CharData.extensions.world；`null` = 未绑定。CharacterMetaForm 只做
   *  下拉换绑（见 TODO.md 2.5b），不支持内嵌编辑世界书内容——那是"角色卡内嵌编辑世界书"，TODO.md
   *  阶段4明确不做。 */
  worldbook: string | null

  extensions: {
    /** 绑定在这张角色卡上的正则脚本，跟预设域 `PresetData.extensions.regex_scripts` 是同一个
     *  概念、同一个字段名，只是宿主换成了角色卡。characterStore 暴露的 live computed 叫
     *  `regexScripts`（跟 presetStore.regexScripts 同名同模式），指向这里。 */
    regex_scripts: RegexScript[]
    /** 脚本树扩展（tavern_helper）。注意内部变量字段名是 `variables`（跟 PresetData 的
     *  `variales` 拼写不同，按用户给的保留差异；类型层统一用 TavernHelper，运行时按 workspace
     *  分派读对应字段名）。必填——characterStore 的 tavernHelper computed 缺则补默认。 */
    tavern_helper: TavernHelper
    [k: string]: any
  }
  [k: string]: any
}

/** 角色列表下拉框用的轻量条目——不含完整内容，只用来给用户选"要切换到哪个角色"。 */
export interface CharacterListEntry {
  avatar: string
  name: string
}

/** CharacterSidebar.vue 固定字段列表的顺序来源（TODO.md 1.2），`key` 拼成虚拟字段 tab 的
 *  `field:${key}`（见 Character 接口顶部 doc comment），EditorShell.vue 按这个前缀路由。 */
export const CHARACTER_FIELDS = [
  { key: 'description', labelKey: 'character.field.description' },
  { key: 'systemPrompt', labelKey: 'character.field.systemPrompt' },
  { key: 'postHistoryInstructions', labelKey: 'character.field.postHistoryInstructions' },
  { key: 'personality', labelKey: 'character.field.personality' },
  { key: 'scenario', labelKey: 'character.field.scenario' },
  { key: 'depthPrompt', labelKey: 'character.field.depthPrompt' },
  { key: 'mesExample', labelKey: 'character.field.mesExample' },
] as const

export const CHARACTER_DEPTH_ROLE_OPTIONS = [
  { value: 0, labelKey: 'worldbook.role.system' },
  { value: 1, labelKey: 'worldbook.role.user' },
  { value: 2, labelKey: 'worldbook.role.assistant' },
] as const
