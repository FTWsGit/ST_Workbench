import type { VarMacroKind, VarScope } from './lib/variables';

/** Tab 路由的"用哪个组件编辑"维度。 */
export type Domain = 'preset' | 'regex' | 'worldbook' | 'character' | 'tavern';

/** Tab 路由的"归哪份文档所有"维度。 */
export type Workspace = 'preset' | 'worldbook' | 'character';

/* ====== 干净数据结构（工作层契约）====== 见 TODO.md。
 * 以下是 store/组件操作的"干净"形状。ST 原生结构（v1/v2CharData、STWorldbook 的
 * Record<uid, entry>、PresetPrompt/prompt_order、ScriptTree 里的 ScriptFolder）在 src/api/*
 * 边界转换成这些形状——store/组件只认这一层，不接触原生字段名、嵌套或"prompts + prompt_order
 * 两套数组"的乱七八糟。
 *
 * 保真纪律：干净层只建模 workbench 需要编辑的字段；未建模进接口的 ST 原生字段由 store 持有一份
 * 原生 raw 快照（preset/worldbook 是 store.raw，character 是 store.oldRaw），保存时经 api 的
 * toNative* 把干净字段写回、未建模字段从 raw 原样透传，保证一次读-改-存不丢数据。 */

/** 文件夹式分组的持久化载体。分组是这个工具自创的组织方式，ST 原生没有这个概念，存成未知字段
 *  让 ST 原样忽略、下次加载时由 api 读回重建分组树。数组内元素的视觉顺序 = 数组顺序，不另设
 *  index/order 字段。 */
export interface GroupFields {
  _gid?: string;
  _gname?: string;
  _gcollapsed?: boolean;
  _genabled?: boolean;
  _gidx?: number;
}

/* ====== 预设（Preset） ====== */
export interface PresetSettings {
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
}

export interface PromptBlock extends GroupFields {
  identifier: string;
  name: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
  system_prompt: boolean;
  marker: boolean;
  /** 启用/禁用——从原生 prompt_order 烘入，数组顺序即视觉顺序。 */
  enabled: boolean;
  /** true = 隐藏块（在原生 prompts 里但不在 prompt_order 里，不参与装配/渲染）。 */
  hidden?: boolean;
  injectionPosition: number;
  injectionDepth: number;
  injectionOrder: number;
}

export interface Preset {
  name: string;
  settings: PresetSettings;
  prompts: PromptBlock[];
  regexs: RegexScript[];
  scripts: Script[];
}

/* ====== 正则脚本 / 酒馆助手脚本 ====== */

/** 正则脚本生效位置——字符串枚举，与 ST 原生数字在 api 边界互转。 */
export type RegexPlacement =
  | 'user_input' // 1 用户输入前
  | 'ai_output' // 2 AI输出前
  | 'quick_command' // 3 快捷命令
  | 'world_info' // 5 世界书插入
  | 'reasoning'; // 6 推理内容

/** 正则脚本作用范围：displayOnly=仅影响显示(markdownOnly=true), promptOnly=仅影响后端提示词(promptOnly=true), both=两者都生效。 */
export type RegexScope = 'displayOnly' | 'promptOnly' | 'both';

/** 正则脚本替换宏模式。 */
export type RegexSubstitute = 'none' | 'raw' | 'escaped';

export interface RegexScript extends GroupFields {
  id: string;
  name: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: RegexPlacement[];
  /** 工作层统一用 enabled，ST 原生是 disabled，取反转换在 api 边界完成。 */
  enabled: boolean;
  /** 作用范围：displayOnly → markdownOnly=true/promptOnly=false; promptOnly → markdownOnly=false/promptOnly=true; both → 两 true。 */
  scope: RegexScope[];
  runOnEdit: boolean;
  substituteRegex: RegexSubstitute;
  depth: { minDepth: number | null; maxDepth: number | null };
}

/** ScriptButton 的字段名跟上游 Js-Slash-Runner 的 zod schema 一致：name 是按钮显示文字，
 *  visible 控制是否在工具栏渲染（false 时仍留在 buttons[] 里只是不渲染）。 */
export interface ScriptButton {
  name: string;
  visible: boolean;
}

/** 酒馆助手脚本（tavern_helper）。工作层是扁平 Script[]，ST 原生的顶层 ScriptFolder 在 api 边界
 *  按 _gid/_gname/_genabled/_gcollapsed 折叠成一个分组（icon/color 还原时用默认值）。 */
export interface Script extends GroupFields {
  enabled: boolean;
  name: string;
  id: string;
  content: string;
  info: string;
  button: { enabled: boolean; buttons: ScriptButton[] };
  data: Record<string, unknown>;
  export_with: { data: boolean; button: boolean };
}

/* ====== 分组树视图（内部）======
 * useGroupedList 操作的树形结构——是"干净数组 + _gid 分组字段"派生出来的运行时视图，
 * 不是 ST 原生结构，也不是干净数据契约本身。identifier 是唯一跟"内容是什么"沾边的字段。 */
export interface OrderItem {
  identifier: string;
  enabled: boolean;
}

export interface OrderGroup {
  id: string;
  _gid: string;
  name: string;
  collapsed: boolean;
  enabled: boolean;
  children: OrderItem[];
}

export type OrderNode = OrderItem | OrderGroup;

export interface FlatNode {
  ref: OrderNode;
  parent: OrderNode[];
  parentIdx: number;
  depth: number;
  isGroup: boolean;
}

export interface PreviewSegment {
  text: string;
  added: boolean; // true = 相对该块原始 content 新增/被替换出来的文本（比如宏被解析后的结果），用于高亮
}

export interface PreviewMessage {
  role: string;
  tokens: number;
  identifier: string;
  segments: PreviewSegment[];
}

export interface PreviewBlockGroup {
  id: string;
  name: string;
  isMarker: boolean;
  messages: PreviewMessage[];
}

/** 变量宏来源载体类型，决定跳转路由到哪个编辑器。 */
export type VarDomain = 'preset' | 'character' | 'worldbook';

/** 装配管线三层硬编码顺序：WI 先于角色卡字段执行 substituteParams，再装配预设。 */
export type VarAssemblyLayer = 'worldbook' | 'character' | 'preset';

export interface VarOp {
  kind: VarMacroKind;
  scope: VarScope;
  varName: string;
  /** 载体定位——跳转用。 */
  source: {
    domain: VarDomain;
    /** preset 名 / 世界书名 / 角色卡名（仅展示，跳转不强依赖）。 */
    fileId: string;
    /** preset prompt identifier / worldbook entry uid（String）。character 域用虚拟字段 tab key。 */
    blockId: string;
    /** character 域专用：'description'/'scenario'/...；其他域为空。 */
    fieldName?: string;
    /** 展示用：preset block name / worldbook entry comment / character 字段名。 */
    blockLabel: string;
    line: number;
    col: number;
    pos: number;
  };
  /** 装配顺序——按 (layer, intraOrder) 升序摆放变量引用。 */
  assemblyOrder: {
    layer: VarAssemblyLayer;
    /** 同 layer 内的顺序：preset=marker+order 合成；character=字段固定序；worldbook=insertion_order 降序。 */
    intraOrder: number;
  };
  /**
   * 此引用所在 block 是否必定进入装配。
   * - preset block：order 树里 enabled && 非折叠组收起。
   * - character 字段：恒 true（角色卡字段始终注入）。
   * - worldbook entry：constant=true 必定触发；关键词/概率/向量化激活皆非必定，为 false。
   * UI 用此字段决定灰度——非必定的引用视觉变暗，但不另加标签。
   */
  certain: boolean;
  /** 仅 set/add 携带；其他宏恒为 ''。前端变量追踪暂不显示值，保留以兼容现有 VarOp 形状与未来恢复显示。 */
  varValue: string;
}

export interface SyntaxColors {
  'hl-b': string;
  'hl-k': string;
  'hl-s': string;
  'hl-v': string;
  'hl-c': string;
  'hl-cm': string;
  'hl-m': string;
  'hl-sq': string;
  'hl-dq': string;
  'hl-ab': string;
  'hl-sb': string;
}

/** 右侧面板/工具箱的三种形态：
 *  'docked'  右侧挤开：嵌入布局流，挤开编辑区
 *  'overlay' 右侧悬浮：absolute 盖在右侧边缘，不挤开布局
 *  'float'   完全悬浮：FloatingPanelShell 可拖拽窗口 */
export type PanelMode = 'docked' | 'overlay' | 'float';

export interface Settings {
  editorFontSize: number;
  editorFontFamily: string;
  syntaxColors: SyntaxColors;
  sidebarWidth: number;
  varPanelWidth: number;
  previewWidth: number;
  varPanelFloat: boolean;
  previewMode: PanelMode;
  toolBoxWidth: number;
  toolBoxMode: PanelMode;
  agentMode: PanelMode;
  agentWidth: number;
  settingsDockWidth: number;
  settingsDockFloat: boolean;
  collectionSwitchOpen: boolean;
  language: 'zh-CN' | 'en';
}

export const DEFAULT_SETTINGS: Settings = {
  editorFontSize: 15,
  editorFontFamily: 'Consolas',
  syntaxColors: {
    'hl-b': '#58b8c0',
    'hl-k': '#a078c0',
    'hl-s': '#555570',
    'hl-v': '#c8a045',
    'hl-c': '#68b868',
    'hl-cm': '#555570',
    'hl-m': '#6090c0',
    'hl-sq': '#c89850',
    'hl-dq': '#78b0c0',
    'hl-ab': '#60a870',
    'hl-sb': '#d08a5c',
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
  collectionSwitchOpen: true,
  language: 'zh-CN',
};

/** Cap on how many search-result rows the results list renders — searchFields() 纯函数仍收集每条命中，
 *  this only limits the DOM list. 工具箱 SearchTool.vue 复用。 */
export const SEARCH_MAX = 200;

export const FONT_OPTIONS = [
  { name: 'Consolas', value: "'Consolas',monospace" },
  { name: 'JetBrains Mono', value: "'JetBrains Mono',monospace" },
  { name: 'DM Sans', value: "'DM Sans',monospace" },
  { name: 'Microsoft Yahei Mono', value: "'Microsoft Yahei Mono','Microsoft YaHei',monospace" },
  { name: 'LXGW WenKai Mono TC', value: "'LXGW WenKai Mono TC',monospace" },
];

export const SYNTAX_LABEL_KEYS = {
  'hl-b': 'shared.syntax.hl-b',
  'hl-k': 'shared.syntax.hl-k',
  'hl-s': 'shared.syntax.hl-s',
  'hl-v': 'shared.syntax.hl-v',
  'hl-c': 'shared.syntax.hl-c',
  'hl-cm': 'shared.syntax.hl-cm',
  'hl-m': 'shared.syntax.hl-m',
  'hl-sq': 'shared.syntax.hl-sq',
  'hl-dq': 'shared.syntax.hl-dq',
  'hl-ab': 'shared.syntax.hl-ab',
  'hl-sb': 'shared.syntax.hl-sb',
} as const;

/**No value 4 here, decided by SillyTavern-v1.18.
 *  字符串枚举与 ST 原生 placement 数字在 api/scriptConvert.ts 互转。 */
export const REGEX_PLACEMENT_OPTIONS = [
  { value: 'user_input' as const, labelKey: 'regex.placement.userInput' },
  { value: 'ai_output' as const, labelKey: 'regex.placement.aiOutput' },
  { value: 'quick_command' as const, labelKey: 'regex.placement.quickCommand' },
  { value: 'world_info' as const, labelKey: 'regex.placement.worldInfo' },
  { value: 'reasoning' as const, labelKey: 'regex.placement.reasoning' },
] as const;

export const REGEX_SUBSTITUTE_OPTIONS = [
  { value: 'none' as const, labelKey: 'regex.substitute.none' },
  { value: 'raw' as const, labelKey: 'regex.substitute.raw' },
  { value: 'escaped' as const, labelKey: 'regex.substitute.escaped' },
] as const;

export const REGEX_SCOPE_OPTIONS = [
  { value: 'displayOnly' as const, labelKey: 'regex.settings.displayOnly' },
  { value: 'promptOnly' as const, labelKey: 'regex.settings.promptOnly' },
  { value: 'both' as const, labelKey: 'regex.settings.both' },
] as const;

/* ====== 世界书（Worldbook / Lorebook） ====== */
export interface WorldbookEntry extends GroupFields {
  uid: number;
  name: string;
  enabled: boolean;
  content: string;

  /** 激活策略: 条目应该何时激活。type 三选一：keyword（关键词/选择性命中）、constant（恒定）、
   *  vectorized（向量化） */
  strategy: {
    type: 'keyword' | 'constant' | 'vectorized';
    keys: string[];
    keysSecondary: { logic: 'and_any' | 'not_all' | 'not_any' | 'and_all'; keys: string[] };
    /** 'same_as_global' 表示跟随全局扫描深度（ST 原生是 null）。 */
    scanDepth: 'same_as_global' | number;
    caseSensitive: boolean | null;
    matchWholeWords: boolean | null;
  };
  position: {
    type:
      | 'before_character_definition'
      | 'after_character_definition'
      | 'before_author_note'
      | 'after_author_note'
      | 'at_depth'
      | 'before_example_messages'
      | 'after_example_messages'
      | 'outlet';
    role: 'system' | 'user' | 'assistant' | null;
    depth: number;
    order: number;
  };

  probability: number;
  recursion: {
    /** 禁止其他条目递归激活本条目 */
    preventIncoming: boolean;
    /** 禁止本条目递归激活其他条目 */
    preventOutgoing: boolean;
    /** 延迟到第 n 级递归检查时才能激活本条目 */
    delayUntil: false | number;
  };
  effect: {
    /** 黏性: 条目激活后, 在之后 n 条消息内始终激活, 无视激活策略、激活概率% */
    sticky: null | number;
    /** 冷却: 条目激活后, 在之后 n 条消息内不能再激活 */
    cooldown: null | number;
    /** 延迟: 聊天中至少有 n 楼消息时, 才能激活条目 */
    delay: null | number;
  };
}

export interface Worldbook {
  name: string;
  entries: WorldbookEntry[];
}

/** position.type 枚举值（字符串）与 ST 原生 position 数字 0~7 的映射在 api/worldbookApi.ts 完成。
 *  枚举书写顺序与数值无关，仅作 UI 下拉的展示顺序（这里按 ST 原生数值序 0~7 排列）。 */
export const WORLDBOOK_POSITION_OPTIONS = [
  { value: 'before_character_definition', labelKey: 'worldbook.position.beforeChar' },
  { value: 'after_character_definition', labelKey: 'worldbook.position.afterChar' },
  { value: 'before_author_note', labelKey: 'worldbook.position.beforeAuthorsNote' },
  { value: 'after_author_note', labelKey: 'worldbook.position.afterAuthorsNote' },
  { value: 'at_depth', labelKey: 'worldbook.position.atDepth' },
  { value: 'before_example_messages', labelKey: 'worldbook.position.beforeExample' },
  { value: 'after_example_messages', labelKey: 'worldbook.position.afterExample' },
  { value: 'outlet', labelKey: 'worldbook.position.outlet' },
] as const;

export const WORLDBOOK_LOGIC_OPTIONS = [
  { value: 'and_any', labelKey: 'worldbook.logic.andAny' },
  { value: 'not_all', labelKey: 'worldbook.logic.notAll' },
  { value: 'not_any', labelKey: 'worldbook.logic.notAny' },
  { value: 'and_all', labelKey: 'worldbook.logic.andAll' },
] as const;

export const WORLDBOOK_ROLE_OPTIONS = [
  { value: null as number | null, labelKey: 'worldbook.role.default' },
  { value: 'system', labelKey: 'worldbook.role.system' },
  { value: 'user', labelKey: 'worldbook.role.user' },
  { value: 'assistant', labelKey: 'worldbook.role.assistant' },
] as const;

/* ====== 角色卡（Character） ====== */
export interface Character {
  /** ST 用来定位这个角色的文件名（不含路径，含 .png 后缀）。新建、还没保存过的角色是空字符串，
   *  characterStore 用"是否为空"判断这是不是一个待创建的新角色。 */
  avatar: string;
  name: string;

  description: string;

  /** 除 description 外的"大文本框"创作字段。depthPrompt.role 使用字符串枚举，与
   *  ST 原生 depth_prompt.role 字符串一致，无需数字互转。 */
  otherPrompts: {
    scenario: string;
    mesExample: string;
    personality: string;
    systemPrompt: string;
    postHistoryInstructions: string;
    depthPrompt: { prompt: string; depth: number; role: 'system' | 'user' | 'assistant' };
  };

  /** 开场白：index 0 = 正式开场白（原生 first_mes），其余 = 候选开场白（原生 alternate_greetings）。 */
  greetings: string[];

  creatorMeta: {
    creator: string;
    creatorNotes: string;
    version: string;
    tags: string[];
  };

  talkativeness: number;
  fav: boolean;
  /** 绑定的世界书名字；`null` = 未绑定。 */
  worldbook: string | null;

  regexs: RegexScript[];
  scripts: Script[];
}

/** 角色列表下拉框用的轻量条目——不含完整内容，只用来给用户选"要切换到哪个角色"。 */
export interface CharacterListEntry {
  avatar: string;
  name: string;
}

/** CharacterSidebar.vue 固定字段列表的顺序来源，`key` 拼成虚拟字段 tab 的 `field:${key}`。
 *  `key` 对应 Character 里的字段名（description 在顶层，其余在 otherPrompts 里），
 *  characterStore 的 currentField/setCurrentFieldValue 按这个映射读写。 */
export const CHARACTER_FIELDS = [
  { key: 'description', labelKey: 'character.field.description' },
  { key: 'systemPrompt', labelKey: 'character.field.systemPrompt' },
  {
    key: 'postHistoryInstructions',
    labelKey: 'character.field.postHistoryInstructions',
  },
  { key: 'personality', labelKey: 'character.field.personality' },
  { key: 'scenario', labelKey: 'character.field.scenario' },
  { key: 'depthPrompt', labelKey: 'character.field.depthPrompt' },
  { key: 'mesExample', labelKey: 'character.field.mesExample' },
] as const;

export const CHARACTER_DEPTH_ROLE_OPTIONS = [
  { value: 'system' as const, labelKey: 'worldbook.role.system' },
  { value: 'user' as const, labelKey: 'worldbook.role.user' },
  { value: 'assistant' as const, labelKey: 'worldbook.role.assistant' },
] as const;
