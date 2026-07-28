import type { LocaleTable } from '../types'
import zhCN from './zh-CN'
// en.ts 必须覆盖 zh-CN.ts 里的每一个 key——i18n/index.ts 用 `Record<keyof typeof zhCN, string>`
// 强制类型约束，漏一个 key 编译直接报错。新增文案永远先加 zh-CN.ts，再回来补这里。
//
// 顺序与 zh-CN.ts 严格保持一一对应，按域分块排列。
export default {
  // ========================================
  // common：跨域原子词
  // ========================================
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.create': 'Create',
  'common.switch': 'Switch',
  'common.new': 'New',
  'common.load': 'Load',
  'common.hidden': 'Hidden',
  'common.unnamed': '(Unnamed)',
  'common.messages': 'Messages',
  'common.tokens': 'tok',
  'common.lines': '{count} lines',
  'common.chars': '{count} chars',
  'common.on': 'On',
  'common.off': 'Off',

  // ========================================
  // shared：跨域通用组件/逻辑
  // ========================================
  // ---- 顶部工具栏 ----
  'shared.header.save': '💾 Save{star}',
  'shared.header.reload': '↻ Reload',
  'shared.header.settings': '⚙ Settings',
  'shared.header.meta': 'ⓘ Meta',
  'shared.header.mode.preset': 'Preset',
  'shared.header.mode.regex': 'Regex',
  'shared.header.mode.worldbook': 'Worldbook',
  'shared.header.mode.character': 'Character',

  // ---- Sidebar ListTools ----
  'shared.sidebar.bind': '🔗 Bind',
  'shared.sidebar.unbind': '🔓 Unbind',


  // ---- 移动端专属 ----
  'shared.mobile.sidebar': 'Sidebar',
  'shared.mobile.tools': 'More Tools',

  // ---- 全局设置弹窗 ----
  'shared.settings.title': 'Editor Settings',
  'shared.settings.language': 'Interface Language',
  'shared.settings.resetDefaults': 'Reset to Defaults',
  'shared.settings.fontSize': 'Font Size',
  'shared.settings.fontFamily': 'Font Family',
  'shared.settings.syntaxColors': 'Syntax Highlight Colors',

  // ---- 跨域通用toast ----
  'shared.toast.settingsReset': 'Settings reset',

  // ---- 通用确认弹窗 ----
  'shared.confirm.unsaved.title': 'Unsaved changes',
  'shared.confirm.unsaved.message': 'You have unsaved changes. Are you sure you want to discard them?',
  'shared.confirm.closePanel.title': 'Unsaved changes remain',
  'shared.confirm.closePanel.message': 'The following workspaces have unsaved changes. Closing the panel only hides it—changes stay in memory and will be restored next time you open it, but they will be lost if you refresh or close SillyTavern before saving:',

  // ---- 通用组件 ----
  'shared.settingsDock.title': '⚙ Settings',
  'shared.floatingPanel.toggleFloat': 'Toggle floating mode',
  'shared.highlightedEditor.cursor': 'Line {line}, Col {col}',

  // ---- 语法高亮标签 ----
  'shared.syntax.hl-b': 'Braces {{ }}',
  'shared.syntax.hl-k': 'Keyword',
  'shared.syntax.hl-s': 'Separator (::)',
  'shared.syntax.hl-v': 'Variable name',
  'shared.syntax.hl-c': 'Variable value',
  'shared.syntax.hl-cm': 'Comment',
  'shared.syntax.hl-m': 'Macro content',
  'shared.syntax.hl-sq': 'Single quotes',
  'shared.syntax.hl-dq': 'Double quotes',
  'shared.syntax.hl-ab': 'Angle brackets < >',
  'shared.syntax.hl-sb': 'Square brackets [ ]',

  // ========================================
  // preset：预设域
  // ========================================
  // ---- 头部工具栏 ----
  'preset.header.copyBlocks': '⇆ Copy Blocks',
  'preset.header.collectionItems': 'Prompts',
  'preset.header.search': '🔎 Search',
  'preset.header.varNav': '📊 Variable Navigator',
  'preset.header.preview': '👁 Preview',
  'preset.header.new': 'New Preset',
  'preset.header.delete': 'Delete Preset',
  'preset.header.switch': 'Switch Preset',
  'preset.header.noneLoaded': '(No preset loaded)',

  // ---- 提示 ----
  'preset.toast.loadFailed': 'Failed to load: {msg}',
  'preset.toast.noDataToSave': 'No data to save',
  'preset.toast.saved': 'Saved: {name}',
  'preset.toast.saveFailed': 'Failed to save: {msg}',
  'preset.toast.created': 'Created: {name}',
  'preset.toast.createFailed': 'Failed to create: {msg}',
  'preset.toast.deleted': 'Deleted: {name}',
  'preset.toast.deleteFailed': 'Failed to delete: {msg}',
  'preset.toast.nothingToCopy': 'Nothing to copy',
  'preset.toast.copied': 'Copied',
  'preset.toast.copyFailed': 'Copy failed, check console',
  'preset.toast.loadFirst': 'Load a preset first',
  'preset.toast.listFailed': 'Failed to fetch preset list: {msg}',
  'preset.toast.notFound': 'Preset not found: {name}',
  'preset.toast.loaded': 'Loaded: {name}',
  'preset.toast.cantLoadContext': 'Failed to load current preset from SillyTavern context: {msg}',
  'preset.toast.noSelected': 'No preset selected in SillyTavern',
  'preset.toast.blockCreated': 'Created',
  'preset.toast.blockDeleted': 'Deleted',
  'preset.toast.blockHidden': 'Hidden',
  'preset.toast.blockAdded': 'Added',
  'preset.toast.duplicateName': 'A preset with this name already exists',
  'preset.toast.reloadNote': 'Note: this is the currently open preset—reload it in the main editor to see changes',
  'preset.toast.copiedBlocks': 'Copied {n} blocks {dir}',
  'preset.toast.listFailedCopyPanel': 'Failed to fetch preset list: {msg}',
  'preset.toast.loadFailedCopyPanel': 'Failed to load: {msg}',
  'preset.toast.select2PlusBlocks': 'Select at least 2 top-level blocks',
  'preset.toast.boundBlocks': 'Bound {count} blocks',
  'preset.toast.unbound': 'Unbound',
  'preset.toast.replaced1': 'Replaced 1 occurrence',
  'preset.toast.previewFailed': 'Preview failed: {msg}',
  'preset.toast.renderedFullPrompt': 'Rendered full prompt',
  'preset.toast.renderedBlocks': 'Rendered {count} blocks',
  'preset.toast.cannotDeleteMarker': 'Cannot delete marker',
  'preset.toast.cannotHideMarker': 'Cannot hide marker',
  'preset.toast.selectPresetFailed': 'Failed to switch ST main menu preset, displayed data may be inaccurate',

  // ---- 确认弹窗 ----
  'preset.confirm.switch.title': 'Switch preset?',
  'preset.confirm.switch.message': 'Switch to preset <strong>{name}</strong>? Unsaved changes to the current preset will be lost.',
  'preset.confirm.delete.title': 'Delete preset?',
  'preset.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'preset.confirm.deleteBlock.title': 'Delete prompt block?',
  'preset.confirm.deleteBlock.message': 'This will permanently remove <strong>{name}</strong> from the preset.',
  'preset.confirm.reload.title': 'Reload preset?',
  'preset.confirm.reload.message': 'Reload preset <strong>{name}</strong>? Unsaved changes to the current preset will be lost.',
  'preset.confirm.reload.confirm': 'Reload',
  'preset.confirm.removeBlock.title': 'Remove block?',
  'preset.confirm.removeBlock.message': 'Remove <strong>{name}</strong> from the list? This only affects the current copy session—it will not be written to disk until you save.',
  'preset.confirm.removeBlock.confirm': 'Remove',
  'preset.confirm.closeUnsaved.title': 'Close without saving?',
  'preset.confirm.closeUnsaved.message': 'You have unsaved copy/delete changes on one or both sides.',
  'preset.confirm.closePanel.item': 'Preset: {name}',

  // ---- 输入弹窗 ----
  'preset.prompt.new.title': 'New Preset Name',
  'preset.prompt.new.placeholder': 'Preset name',

  // ---- 侧边栏 ----
  'preset.sidebar.title': 'Prompt Blocks ({count})',
  'preset.sidebar.newBlock': '+ New',
  'preset.sidebar.hiddenBlock': '+ Hidden Blocks',
  'preset.sidebar.hiddenTitle': 'Not in current active order',
  'preset.sidebar.settingsPanel': 'Settings Panel (Name/Role)',

  // ---- 块设置表单 ----
  'preset.settings.name': 'Name',
  'preset.settings.namePlaceholder': 'Name this block',
  'preset.settings.role': 'Role',
  'preset.settings.markerHint': 'This is a marker block ({id}). Its content is generated internally by SillyTavern; changes to role/name here may not affect actual rendering.',
  'preset.settings.empty': 'Select a block to edit its settings',

  // ---- 搜索替换 ----
  'preset.search.placeholder': 'Search all blocks…',
  'preset.search.replacePlaceholder': 'Replace…',
  'preset.search.replace': 'Replace',
  'preset.search.replaceAll': 'Replace All',
  'preset.search.results': '{count} results',

  // ---- 变量导航面板 ----
  'preset.varPanel.title': '📊 Variables',
  'preset.varPanel.filter': 'Filter…',
  'preset.varPanel.prev': '◀ Prev',
  'preset.varPanel.next': 'Next ▶',

  // ---- 预览面板 ----
  'preset.preview.title': '👁 Prompt Preview',
  'preset.preview.collapseExpand': 'Collapse/Expand All',
  'preset.preview.modeBlocks': 'Per Block',
  'preset.preview.modeRaw': 'Final Request',
  'preset.preview.hintBlocks': 'Real per-block rendering from SillyTavern\'s prompt manager. Highlighted text is substituted in (macros/regex etc.)—not literal in block source.',
  'preset.preview.hintRaw': 'Exact messages array SillyTavern is about to send to the API—captured via a real generation that is immediately cancelled, so nothing is actually sent.',
  'preset.preview.generate': '▶ Generate',
  'preset.preview.copy': '📋 Copy',
  'preset.preview.generating': '⏳ Generating…',
  'preset.preview.collapseExpandSingle': 'Collapse/Expand',
  'preset.preview.emptyBlocks': 'Click "Generate" for a real per-block render (this runs an actual dry-run generation).',
  'preset.preview.emptyRaw': 'Click "Generate" to capture the final request—this briefly starts a real generation then immediately cancels it.',

  // ---- 变量弹窗 ----
  'preset.varPopup.hit': '{count} matches',
  'preset.varPopup.hitSingle': '{count} match',

  // ---- 跨预设复制面板 ----
  'preset.copyPanel.title': '⇆ Copy Prompt Blocks Between Presets',
  'preset.copyPanel.selectPreset': 'Select preset…',
  'preset.copyPanel.selectAll': 'All',
  'preset.copyPanel.clearAll': 'None',
  'preset.copyPanel.noBlocks': 'No blocks',
  'preset.copyPanel.pickPreset': 'Select and load a preset',
  'preset.copyPanel.copyRight': 'Copy selected → right',
  'preset.copyPanel.copyLeft': 'Copy selected → left',
  'preset.copyPanel.removeBlock': 'Remove from this list',
  'preset.copyPanel.dirRight': '→ right',
  'preset.copyPanel.dirLeft': '→ left',
  'preset.copyPanel.loadBothFirst': 'Load both sides first',
  'preset.copyPanel.selectBlocksFirst': 'Select blocks to copy first',

  // ---- 预设元信息（模型参数） ----
  'preset.metaForm.title': 'ⓘ Preset Parameters',
  'preset.metaForm.contextLabel': 'Max Context (Tokens)',
  'preset.metaForm.maxTokensLabel': 'Max Response Length (Tokens)',
  'preset.metaForm.repliesLabel': 'Number of Replies',
  'preset.metaForm.streamLabel': 'Streaming',
  'preset.metaForm.squashLabel': 'Squash consecutive system messages',
  'preset.metaForm.samplingToggle': 'Sampling Parameters',
  'preset.metaForm.temperatureLabel': 'Temperature',
  'preset.metaForm.topPLabel': 'Top P',
  'preset.metaForm.freqPenaltyLabel': 'Frequency Penalty',
  'preset.metaForm.presPenaltyLabel': 'Presence Penalty',
  'preset.metaForm.repPenaltyLabel': 'Repetition Penalty',
  'preset.metaForm.minPLabel': 'Min P',
  'preset.metaForm.topKLabel': 'Top K',
  'preset.metaForm.topALabel': 'Top A',
  'preset.metaForm.seedLabel': 'Seed',
  'preset.metaForm.seedHint': '-1 for random',

  // ---- 编辑区空状态 ----
  'preset.editorShell.empty': 'Select a block to edit',
  'preset.editorShell.loading': 'Loading preset from context…',

  // ========================================
  // regex：正则域
  // ========================================
  // ---- 侧边栏 ----
  'regex.sidebar.title': 'Regex Scripts ({count})',
  'regex.sidebar.newScript': '+ New',
  'regex.sidebar.empty': 'No bound regex scripts yet',
  'regex.sidebar.toggleTitle': 'Enable/Disable',
  'regex.sidebar.deleteTitle': 'Delete',

  // ---- 内容编辑 ----
  'regex.editor.edit': '✏️ Edit',
  'regex.editor.preview': '👁 Preview',
  'regex.editor.plainText': 'Plain Text',
  'regex.editor.html': 'HTML',
  'regex.editor.settingsPanel': 'Settings Panel',
  'regex.editor.placeholder': 'Use {{match}} for the whole match, $1 / $2 for capture groups',
  'regex.editor.testText': 'Test Text',
  'regex.editor.testPlaceholder': 'Paste a message text, switch to "Preview" to see the effect…',
  'regex.editor.invalidFindRegex': 'Find regex is invalid; preview will return input text as-is',
  'regex.editor.previewLimitation': 'Preview only does local find/replace/trim; it does not resolve macros or represent scope/depth limits.',
  'regex.editor.previewError': 'Preview error: {msg}',

  // ---- 设置表单 ----
  'regex.settings.enabled': 'Enabled',
  'regex.settings.findRegexLabel': 'Find Regex',
  'regex.settings.findRegexPlaceholder': '/pattern/flags',
  'regex.settings.findRegexInvalid': 'Regex is invalid',
  'regex.settings.scriptNameLabel': 'Script Name',
  'regex.settings.scriptNamePlaceholder': 'Name this regex script',
  'regex.settings.placementLabel': 'Placement',
  'regex.settings.surfaceLabel': 'Surface Replace',
  'regex.settings.displayOnly': 'Affects display only',
  'regex.settings.promptOnly': 'Affects backend prompt only',
  'regex.settings.both': 'Affects both',
  'regex.settings.advancedToggle': 'Advanced Options',
  'regex.settings.trimLabel': 'Trim out (one per line)',
  'regex.settings.runOnEdit': 'Run on edit',
  'regex.settings.substituteLabel': 'Macros to regex-find',
  'regex.settings.minDepth': 'Min Depth',
  'regex.settings.maxDepth': 'Max Depth',
  'regex.settings.depthPlaceholder': 'Unlimited',

  // ---- 选项枚举 ----
  'regex.placement.userInput': 'User Input',
  'regex.placement.aiOutput': 'AI Output',
  'regex.placement.quickCommand': 'Quick Command',
  'regex.placement.worldInfo': 'World Info',
  'regex.placement.reasoning': 'Reasoning',
  'regex.substitute.none': 'No substitution',
  'regex.substitute.raw': 'Substitute (raw)',
  'regex.substitute.escaped': 'Substitute (escaped)',

  // ---- 确认弹窗 ----
  'regex.confirm.delete.title': 'Delete regex script?',
  'regex.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>.',

  // ---- 编辑区空状态 ----
  'regex.editorShell.empty': 'Select a regex script, or create a new one',

  // ========================================
  // worldbook：世界书域
  // ========================================
  // ---- 头部工具栏 ----
  'worldbook.header.new': 'New Worldbook',
  'worldbook.header.importFromCharacter': 'Import from character',
  'worldbook.header.delete': 'Delete Worldbook',
  'worldbook.header.switch': 'Switch Worldbook',
  'worldbook.header.noneLoaded': '(No Worldbook Loaded)',

  // ---- 提示 ----
  'worldbook.toast.listFailed': 'Failed to fetch worldbook list: {msg}',
  'worldbook.toast.loadFailed': 'Failed to load worldbook: {msg}',
  'worldbook.toast.notFound': 'Worldbook not found: {name}',
  'worldbook.toast.loaded': 'Loaded worldbook {name}',
  'worldbook.toast.noneSelected': 'No worldbook loaded yet',
  'worldbook.toast.noDataToSave': 'No worldbook data to save',
  'worldbook.toast.saved': 'Saved worldbook {name}',
  'worldbook.toast.saveFailed': 'Failed to save worldbook: {msg}',
  'worldbook.toast.duplicateName': 'A worldbook with this name already exists',
  'worldbook.toast.created': 'Created worldbook {name}',
  'worldbook.toast.createFailed': 'Failed to create worldbook: {msg}',
  'worldbook.toast.deleted': 'Deleted worldbook {name}',
  'worldbook.toast.deleteFailed': 'Failed to delete worldbook: {msg}',
  'worldbook.toast.loadFirst': 'Load or create a worldbook first',
  'worldbook.toast.importNoBook': 'This character has no embedded worldbook',
  'worldbook.toast.imported': 'Imported {count} entries into worldbook {name}',
  'worldbook.toast.importFailed': 'Failed to import from character: {msg}',
  'worldbook.toast.created2': 'Entry created',
  'worldbook.toast.entryDeleted': 'Deleted',

  // ---- 确认弹窗 ----
  'worldbook.confirm.switch.title': 'Switch worldbook?',
  'worldbook.confirm.switch.message': 'Switch to worldbook <strong>{name}</strong>? Unsaved changes to the current worldbook will be lost.',
  'worldbook.confirm.delete.title': 'Delete worldbook?',
  'worldbook.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'worldbook.confirm.deleteEntry.title': 'Delete entry?',
  'worldbook.confirm.deleteEntry.message': 'This will permanently remove <strong>{name}</strong> from the worldbook.',
  'worldbook.confirm.closePanel.item': 'Worldbook: {name}',

  // ---- 输入弹窗 ----
  'worldbook.prompt.new.title': 'New Worldbook Name',
  'worldbook.prompt.new.placeholder': 'Worldbook name',
  'worldbook.prompt.import.title': 'Import as new worldbook',
  'worldbook.prompt.import.suffix': "'s Worldbook",

  // ---- 侧边栏 ----
  'worldbook.sidebar.title': 'Worldbook Entries ({count})',
  'worldbook.sidebar.newEntry': '+ New',
  'worldbook.sidebar.empty': 'No worldbook loaded yet. Select one from the top right, or create a new one',
  'worldbook.sidebar.defaultGroupName': 'Group ({count})',
  'worldbook.sidebar.tools': '🛠 Bulk',

  // ---- 批量工具面板 ----
  'worldbook.tools.title': 'Bulk Tools',
  'worldbook.tools.selectedCount': '{count} entries selected',
  'worldbook.tools.enableLabel': 'Enabled State',
  'worldbook.tools.enableSelected': 'Enable Selected',
  'worldbook.tools.disableSelected': 'Disable Selected',
  'worldbook.tools.activationLabel': 'Activation Type',
  'worldbook.tools.noSelection': 'Select some entries in the left list first (Ctrl/Shift for multi-select)',
  'worldbook.tools.applied': 'Applied to {count} entries',

  // ---- 选项枚举 ----
  'worldbook.activation.keyWord': '🟢 Keyword',
  'worldbook.activation.constant': '🔵 Constant',
  'worldbook.activation.vectorized': '🔗 Vectorized',
  'worldbook.position.beforeChar': 'Before Character Definition',
  'worldbook.position.afterChar': 'After Character Definition',
  'worldbook.position.beforeExample': 'Before Example Messages',
  'worldbook.position.afterExample': 'After Example Messages',
  'worldbook.position.beforeAuthorsNote': 'Before Author\'s Note',
  'worldbook.position.afterAuthorsNote': 'After Author\'s Note',
  'worldbook.position.atDepth': 'At Depth ⚙',
  'worldbook.position.outlet': 'Outlet',
  'worldbook.logic.andAny': 'AND Any',
  'worldbook.logic.notAll': 'NOT All',
  'worldbook.logic.notAny': 'NOT Any',
  'worldbook.logic.andAll': 'AND All',
  'worldbook.role.default': 'Default',
  'worldbook.role.system': 'System',
  'worldbook.role.user': 'User',
  'worldbook.role.assistant': 'Assistant',

  // ---- 编辑器 ----
  'worldbook.editor.placeholder': 'Edit worldbook entry content here…',

  // ---- 条目设置表单 ----
  'worldbook.settings.enabled': 'Enabled',
  'worldbook.settings.commentLabel': 'Title / Comment',
  'worldbook.settings.commentPlaceholder': 'Entry title (for identification only, not matched for activation)',
  'worldbook.settings.groupActivation': 'Activation Strategy',
  'worldbook.settings.groupPosition': 'Insertion Position',
  'worldbook.settings.groupRecursion': 'Recursion & Matching',
  'worldbook.settings.groupEffects': 'Special Effects',
  'worldbook.settings.keysLabel': 'Primary Keywords (comma separated list)',
  'worldbook.settings.keysPlaceholder': 'keyword1, keyword2',
  'worldbook.settings.activationLabel': 'Activation Type',
  'worldbook.settings.selective': 'Require secondary keywords to also match',
  'worldbook.settings.keysSecondaryLabel': 'Secondary Keywords (comma separated list)',
  'worldbook.settings.logicLabel': 'Logic',
  'worldbook.settings.positionLabel': 'Insert Position',
  'worldbook.settings.depthLabel': 'Depth',
  'worldbook.settings.roleLabel': 'Role',
  'worldbook.settings.orderLabel': 'Insert Order (lower numbers come first)',
  'worldbook.settings.probabilityLabel': 'Trigger by probability',
  'worldbook.settings.excludeRecursion': 'Exclude from recursion scan (will not be matched by other entries)',
  'worldbook.settings.preventRecursion': 'Prevent recursion (will not trigger other entries)',
  'worldbook.settings.delayUntilRecursion': 'Delay until recursion stage',
  'worldbook.settings.scanDepthLabel': 'Scan Depth',
  'worldbook.settings.sameAsGlobal': 'Follow global setting',
  'worldbook.settings.caseSensitiveLabel': 'Case Sensitive',
  'worldbook.settings.matchWholeWordsLabel': 'Match Whole Words',
  'worldbook.settings.stickyLabel': 'Sticky',
  'worldbook.settings.cooldownLabel': 'Cooldown',
  'worldbook.settings.delayLabel': 'Delay',
  'worldbook.settings.groupLabel': 'Mutual Exclusion Group',
  'worldbook.settings.groupPlaceholder': 'Only one entry per group is selected by weight/priority',
  'worldbook.settings.groupPrioritized': 'Prioritized in group',

  // ---- 编辑区空状态 ----
  'worldbook.editorShell.empty': 'Loading worldbook list…',
  'worldbook.editorShell.emptyEntry': 'Select an entry, or create a new one',

  // ========================================
  // character：角色卡域
  // ========================================
  // ---- 头部工具栏 ----
  'character.header.new': 'New Character',
  'character.header.collectionFields': 'Fields',
  'character.header.delete': 'Delete Character',
  'character.header.switch': 'Switch Character',
  'character.header.noneLoaded': '(No Character Loaded)',

  // ---- 提示 ----
  'character.toast.listFailed': 'Failed to fetch character list: {msg}',
  'character.toast.loadFailed': 'Failed to load character: {msg}',
  'character.toast.notFound': 'Character not found: {name}',
  'character.toast.loaded': 'Loaded character {name}',
  'character.toast.noneSelected': 'No character loaded yet',
  'character.toast.noDataToSave': 'No character data to save',
  'character.toast.saved': 'Saved character {name}',
  'character.toast.saveFailed': 'Failed to save character: {msg}',
  'character.toast.duplicateName': 'A character with this name already exists',
  'character.toast.created': 'Created character {name}',
  'character.toast.createFailed': 'Failed to create character: {msg}',
  'character.toast.deleted': 'Deleted character {name}',
  'character.toast.deleteFailed': 'Failed to delete character: {msg}',
  'character.toast.loadFirst': 'Load or create a character first',
  'character.toast.greetingDeleted': 'Greeting deleted',
  'character.toast.needAtLeastOneGreeting': 'At least one greeting must remain',

  // ---- 确认弹窗 ----
  'character.confirm.switch.title': 'Switch character?',
  'character.confirm.switch.message': 'Switch to character <strong>{name}</strong>? Unsaved changes to the current character will be lost.',
  'character.confirm.delete.title': 'Delete character?',
  'character.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'character.confirm.deleteGreeting.title': 'Delete greeting?',
  'character.confirm.deleteGreeting.message': 'This will permanently remove this greeting. This cannot be undone.',
  'character.confirm.newCharacter.message': 'Creating a new character will discard current unsaved changes. Are you sure you want to continue?',
  'character.confirm.closePanel.item': 'Character: {name}',

  // ---- 输入弹窗 ----
  'character.prompt.new.title': 'New Character Name',
  'character.prompt.new.placeholder': 'Character name',

  // ---- 侧边栏 ----
  'character.sidebar.title': 'Character Card',
  'character.sidebar.empty': 'No character loaded yet. Create or select one',
  'character.sidebar.fieldsLabel': 'Content Fields',
  'character.sidebar.greetingsLabel': 'Greetings',
  'character.sidebar.addGreeting': '+ Greeting',
  'character.sidebar.regexMode': 'Regex',
  'character.sidebar.fieldsMode': '← Fields',
  'character.sidebar.deleteGreetingTitle': 'Delete this greeting',
  'character.sidebar.greetingLabel': 'Greeting {n}',

  // ---- 编辑器 ----
  'character.editor.placeholder': 'Edit content here…',
  'character.editor.depthLabel': 'Depth',
  'character.editor.roleLabel': 'Role',

  // ---- 固定字段标签 ----
  'character.field.description': 'Description',
  'character.field.systemPrompt': 'Main Prompt',
  'character.field.postHistoryInstructions': 'Post-History Instructions',
  'character.field.personality': 'Personality summary',
  'character.field.scenario': 'Scenario',
  'character.field.depthPrompt': 'Character\'s Note',
  'character.field.mesExample': 'Examples of dialogue',

  // ---- 角色元信息 ----
  'character.metaForm.title': 'ⓘ Character Info',
  'character.metaForm.favLabel': '⭐ Favorite',
  'character.metaForm.creatorLabel': 'Creator',
  'character.metaForm.versionLabel': 'Version',
  'character.metaForm.creatorNotesLabel': 'Creator Notes',
  'character.metaForm.tagsLabel': 'Tags',
  'character.metaForm.tagsPlaceholder': 'Comma-separated, e.g.: fantasy, original',
  'character.metaForm.talkativenessLabel': 'Talkativeness',
  'character.metaForm.creatorToggle': 'Creator Meta',
  'character.metaForm.worldbookLabel': 'Bound Worldbook',
  'character.metaForm.worldbookNone': '(None bound)',

  // ---- 编辑区空状态 ----
  'character.editorShell.empty': 'No character loaded yet. Create or select one',
  'character.editorShell.emptyField': 'Select a field to edit',
} satisfies Record<keyof typeof zhCN, string>
