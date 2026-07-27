import type { LocaleTable } from '../types'
import type zhCN from './zh-CN'

// Must cover every key in zh-CN.ts — typed against `keyof typeof zhCN` directly (not via
// index.ts) to avoid a circular import: index.ts imports this file, so this file can't import
// LocaleKey back from index.ts. A missing key here is a compile-time error, not a silent
// runtime `undefined`.
export default {
  // ---- common ----
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.ok': 'OK',
  'common.new': 'New',
  'common.load': 'Load',
  'common.all': 'All',
  'common.search': 'Search',
  'common.replace': 'Replace',
  'common.results': 'results',
  'common.prev': 'Prev',
  'common.next': 'Next',
  'common.filter': 'Filter',
  'common.generate': 'Generate',
  'common.copy': 'Copy',
  'common.generating': 'Generating…',
  'common.hidden': 'Hidden',
  'common.unnamed': '(Unnamed)',
  'common.messages': 'messages',
  'common.tokens': 'tok',
  'common.lines': '{count} lines',
  'common.chars': '{count} chars',

  // ---- shared.header ----
  'shared.header.save': '💾 Save{star}',
  'shared.header.reload': '↻ Reload',
  'preset.header.copyBlocks': '⇆ Copy Blocks',
  'preset.header.search': '🔍 Search',
  'shared.header.settings': '⚙ Settings',
  'preset.header.varNav': '📊 Var Nav',
  'preset.header.preview': '👁 Preview',
  'shared.header.meta': 'ℹ️ Meta',
  'preset.header.new': 'New preset',
  'preset.header.delete': 'Delete preset',
  'preset.header.switch': 'Switch preset',
  'preset.header.noneLoaded': '(none loaded)',
  'header.mode.preset': 'Presets',
  'header.mode.regex': 'Regex',

  // Mobile-only header controls (App.vue) — ☰ opens the sidebar as a left drawer, ⋯ opens the
  // tools action sheet. Everything the action sheet lists reuses the existing shared.header.*
  // labels above (mode.preset/mode.regex/reload/copyBlocks/search/settings/varNav/preview/
  // newPreset/deletePreset), so only these two container labels are new.
  'shared.mobile.sidebar': 'Sidebar',
  'shared.mobile.tools': 'More Tools',

  // ---- shared.settings ----
  'shared.settings.title': 'Editor Settings',
  'shared.settings.language': 'Language',
  'shared.settings.resetDefaults': 'Reset Defaults',
  'shared.settings.fontSize': 'Font Size',
  'shared.settings.fontFamily': 'Font Family',
  'shared.settings.syntaxColors': 'Syntax Highlight Colors',

  // ---- toast：跨域通用的 toast 文案 ----
  'toast.settingsReset': 'Settings reset',
  'toast.loadFailed': 'Load failed: {msg}',
  'toast.noDataToSave': 'No data to save',
  'toast.saved': 'Saved: {name}',
  'toast.saveFailed': 'Save failed: {msg}',
  'toast.created': 'Created: {name}',
  'toast.createFailed': 'Create failed: {msg}',
  'toast.deleted': 'Deleted: {name}',
  'toast.deleteFailed': 'Delete failed: {msg}',
  'toast.nothingToCopy': 'Nothing to copy',
  'toast.copied': 'Copied',
  'toast.copyFailed': 'Copy failed — see console for details',

  // ---- preset.toast：预设域 toast ----
  'preset.toast.loadFirst': 'Load a preset first',
  'preset.toast.listFailed': 'Could not list presets: {msg}',
  'preset.toast.notFound': 'Preset not found: {name}',
  'preset.toast.loaded': 'Loaded: {name}',
  'preset.toast.cantLoadContext': 'Can\'t load selected preset in SillyTavern: {msg}',
  'preset.toast.noSelected': 'No preset currently selected in SillyTavern',
  'preset.toast.blockCreated': 'Created',
  'preset.toast.blockDeleted': 'Deleted',
  'preset.toast.blockHidden': 'Hidden',
  'preset.toast.blockAdded': 'Added',
  'preset.toast.duplicateName': 'A preset with this name already exists',
  'preset.toast.reloadNote': 'Note: this is your currently-open preset — Reload it in the main editor to see these changes',
  'preset.toast.copiedBlocks': 'Copied {n} block(s) {dir}',
  'preset.toast.listFailedCopyPanel': 'Could not list presets: {msg}',
  'preset.toast.loadFailedCopyPanel': 'Load failed: {msg}',
  'preset.toast.select2PlusBlocks': 'Please select at least 2 top-level blocks',
  'preset.toast.boundBlocks': 'Bound {count} blocks',
  'preset.toast.unbound': 'Unbound',
  'preset.toast.replaced1': 'Replaced 1 occurrence',
  'preset.toast.previewFailed': 'Preview failed: {msg}',
  'preset.toast.renderedFullPrompt': 'Rendered full prompt',
  'preset.toast.renderedBlocks': 'Rendered {count} block(s)',
  'preset.toast.cannotDeleteMarker': 'Can not delete Marker',
  'preset.toast.cannotHideMarker': 'Can not hide Marker',
  'preset.toast.selectPresetFailed': 'Failed to select preset in ST Main Menu, shown data might be incorrect',

  // ---- shared.confirm ----
  'preset.confirm.switch.title': 'Switch preset?',
  'preset.confirm.switch.message': 'Switch to preset <strong>{name}</strong>? Any unsaved edits to the current preset will be lost.',
  'preset.confirm.switch.confirm': 'Switch',
  'preset.confirm.delete.title': 'Delete preset?',
  'preset.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'preset.confirm.deleteBlock.title': 'Delete prompt block?',
  'preset.confirm.deleteBlock.message': 'This will permanently remove <strong>{name}</strong> from the preset.',
  'preset.confirm.deleteBlock.confirm': 'Delete',
  'preset.confirm.deleteBlock.cancel': 'Cancel',
  'regex.confirm.delete.title': 'Delete regex script?',
  'regex.confirm.delete.message': 'This will permanently remove <strong>{name}</strong> from the preset.',
  'preset.confirm.reload.title': 'Reload preset?',
  'preset.confirm.reload.message': 'Reload preset <strong>{name}</strong>? Any unsaved edits to the current preset will be lost.',
  'preset.confirm.reload.confirm': 'Reload',
  'preset.confirm.removeBlock.title': 'Remove block?',
  'preset.confirm.removeBlock.message': 'Remove <strong>{name}</strong> from this list? This only affects the in-progress copy session — nothing is written to disk until you hit Save.',
  'preset.confirm.removeBlock.confirm': 'Remove',
  'preset.confirm.closeUnsaved.title': 'Close without saving?',
  'preset.confirm.closeUnsaved.message': 'You have unsaved copy/delete changes on one or both sides.',
  'preset.confirm.closeUnsaved.confirm': 'Close',
  'shared.confirm.closePanel.title': 'Unsaved changes',
  'shared.confirm.closePanel.message': "The following workspaces still have unsaved changes. Closing the panel only hides it — your changes stay in memory and are restored automatically next time you open it. But if you refresh or close the SillyTavern page before saving, they'll be lost:",
  'shared.confirm.closePanel.confirm': 'Close',
  'preset.confirm.closePanel.item': 'Preset: {name}',
  'shared.confirm.unsaved.title': 'Unsaved changes',
  'shared.confirm.unsaved.message': 'You have unsaved changes. Are you sure you want to discard them?',

  // ---- shared.prompt ----
  'preset.prompt.new.title': 'New Preset Name',
  'preset.prompt.new.placeholder': 'Preset name',
  'preset.prompt.new.confirm': 'Create',
  'preset.prompt.new.cancel': 'Cancel',

  // ---- shared.tabBar ----
  'shared.tabBar.close': 'Close',

  // ---- shared.settingsDock ----
  'shared.settingsDock.title': '⚙ Settings',
  'shared.settingsDock.toggleFloat': 'Toggle float mode',

  // ---- shared.listToolbar ----
  'shared.listToolbar.count': '{count} items',

  // ---- shared.editorShell ----
  'regex.editorShell.empty': 'Select a regex or create a new one',
  'preset.editorShell.empty': 'Select a block to edit',
  'preset.editorShell.loading': 'Loading preset from context...',

  // ---- shared.highlightedEditor ----
  'shared.highlightedEditor.cursor': 'Ln {line}, Col {col}',

  // ---- preset.sidebar ----
  'preset.sidebar.title': 'Prompt Blocks',
  'preset.sidebar.newBlock': '+ New',
  'preset.sidebar.hiddenBlock': '+ Hidden',
  'preset.sidebar.bind': '🔗 Bind',
  'preset.sidebar.unbind': '🔓 Unbind',
  'preset.sidebar.hiddenTitle': 'Not in current active order',
  'preset.sidebar.settingsPanel': 'Settings panel (name/role)',

  // ---- preset.settingsForm ----
  'preset.settings.name': 'Name',
  'preset.settings.namePlaceholder': 'Give this block a name',
  'preset.settings.role': 'Role',
  'preset.settings.markerHint': 'This is a marker block ({id}), content is internally generated by SillyTavern. Role/name changes here may not affect actual rendering.',
  'preset.settings.empty': 'Select a block to edit its settings',

  // ---- preset.search ----
  'preset.search.placeholder': 'Search all blocks…',
  'preset.search.replacePlaceholder': 'Replace…',
  'preset.search.replace': 'Replace',
  'preset.search.replaceAll': 'Replace All',
  'preset.search.results': '{count} results',

  // ---- preset.varPanel ----
  'preset.varPanel.title': '📊 Variables',
  'preset.varPanel.toggleFloat': 'Toggle float mode',
  'preset.varPanel.filter': 'Filter…',
  'preset.varPanel.prev': '◀ Prev',
  'preset.varPanel.next': 'Next ▶',

  // ---- preset.preview ----
  'preset.preview.title': '👁 Prompt Preview',
  'preset.preview.toggleFloat': 'Toggle float mode',
  'preset.preview.collapseExpand': 'Collapse/Expand all',
  'preset.preview.modeBlocks': 'Per-Block',
  'preset.preview.modeRaw': 'Final Request',
  'preset.preview.hintBlocks': 'Real per-block rendering from SillyTavern\'s own prompt manager. Highlighted text was substituted in (macros/regex/etc) — not literally in the block\'s source.',
  'preset.preview.hintRaw': 'The exact messages array SillyTavern was about to send to the API — captured off a real generation that\'s cancelled immediately after, so nothing actually gets sent.',
  'preset.preview.generate': '▶ Generate',
  'preset.preview.copy': '📋 Copy',
  'preset.preview.generating': '⏳ Generating…',
  'preset.preview.collapseExpandSingle': 'Collapse/Expand',
  'preset.preview.emptyBlocks': 'Click "Generate" for a real per-block render (this runs an actual dry-run generation).',
  'preset.preview.emptyRaw': 'Click "Generate" to capture the final request — this briefly starts a real generation and cancels it right after.',

  // ---- preset.varPopup ----
  'preset.varPopup.hit': '{count} hits',
  'preset.varPopup.hitSingle': '{count} hit',

  // ---- preset.copyPanel ----
  'preset.copyPanel.title': '🔀 Copy Blocks Between Presets',
  'preset.copyPanel.selectPreset': 'Select preset…',
  'preset.copyPanel.load': 'Load',
  'preset.copyPanel.selectAll': 'All',
  'preset.copyPanel.clearAll': 'None',
  'preset.copyPanel.noBlocks': 'No blocks',
  'preset.copyPanel.pickPreset': 'Pick and load a preset',
  'preset.copyPanel.copyRight': 'Copy selected → right',
  'preset.copyPanel.copyLeft': 'Copy selected → left',
  'preset.copyPanel.removeBlock': 'Remove from this list',
  'preset.copyPanel.close': 'Close',
  'preset.copyPanel.dirRight': '→ right',
  'preset.copyPanel.dirLeft': '→ left',
  'preset.copyPanel.loadBothFirst': 'Load both sides first',
  'preset.copyPanel.selectBlocksFirst': 'Select block(s) to copy first',

  // ---- preset.metaForm: preset meta (model parameters, TODO.md stage 2b) ----
  'preset.metaForm.title': 'ℹ️ Preset Parameters',
  'preset.metaForm.contextLabel': 'Max Context (Tokens)',
  'preset.metaForm.maxTokensLabel': 'Max Reply Length (Tokens)',
  'preset.metaForm.repliesLabel': 'Reply Count',
  'preset.metaForm.streamLabel': 'Streaming',
  'preset.metaForm.squashLabel': 'Squash Consecutive System Messages',
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

  // ---- regex.sidebar ----
  'regex.sidebar.title': 'Regex Scripts',
  'regex.sidebar.newScript': '+ New',
  'regex.sidebar.empty': 'No bound regex scripts yet',
  'regex.sidebar.toggleTitle': 'Enable/Disable',
  'regex.sidebar.deleteTitle': 'Delete',

  // ---- regex.contentEditor ----
  'regex.editor.edit': '✏️ Edit',
  'regex.editor.preview': '👁 Preview',
  'regex.editor.plainText': 'Plain Text',
  'regex.editor.html': 'HTML',
  'regex.editor.settingsPanel': 'Settings panel',
  'regex.editor.placeholder': 'Use {{match}} for full match, $1 / $2 for capture groups',
  'regex.editor.testText': 'Test Text',
  'regex.editor.testPlaceholder': 'Paste a message text here, switch to "Preview" to see the effect…',
  'regex.editor.invalidFindRegex': 'Find regex syntax is invalid, preview will return input text as-is',
  'regex.editor.previewLimitation': 'Preview only does local find/replace/trim — it does not parse macros and does not represent placement/depth restrictions.',
  'regex.editor.previewError': 'Preview error: {msg}',

  // ---- regex.settingsForm ----
  'regex.settings.enabled': 'Enabled',
  'regex.settings.findRegexLabel': 'Find Regex',
  'regex.settings.findRegexPlaceholder': '/pattern/flags',
  'regex.settings.findRegexInvalid': 'Invalid regex syntax',
  'regex.settings.scriptNameLabel': 'Script Name',
  'regex.settings.scriptNamePlaceholder': 'Give this regex a name',
  'regex.settings.placementLabel': 'Placement',
  'regex.settings.surfaceLabel': 'Surface Replacement',
  'regex.settings.displayOnly': 'Display Only',
  'regex.settings.promptOnly': 'Prompt Only',
  'regex.settings.both': 'Both',
  'regex.settings.advancedToggle': 'Advanced Options',
  'regex.settings.trimLabel': 'Trim Strings (one per line)',
  'regex.settings.runOnEdit': 'Run on Edit',
  'regex.settings.substituteLabel': 'Macro for Regex Find',
  'regex.settings.minDepth': 'Min Depth',
  'regex.settings.maxDepth': 'Max Depth',
  'regex.settings.depthPlaceholder': 'Unlimited',

  // ---- regex.placement ----
  'regex.placement.userInput': 'User Input',
  'regex.placement.aiOutput': 'AI Output',
  'regex.placement.quickCommand': 'Quick Command',
  'regex.placement.worldInfo': 'World Info',
  'regex.placement.reasoning': 'Reasoning',

  // ---- regex.substitute ----
  'regex.substitute.none': 'No Replace',
  'regex.substitute.raw': 'Replace (Raw)',
  'regex.substitute.escaped': 'Replace (Escaped)',

  // ---- syntax highlight labels ----
  'syntax.hl-b': 'Brackets {{ }}',
  'syntax.hl-k': 'Keywords',
  'syntax.hl-s': 'Separators (::)',
  'syntax.hl-v': 'Variable Names',
  'syntax.hl-c': 'Variable Values',
  'syntax.hl-cm': 'Comments',
  'syntax.hl-m': 'Macro Content',
  'syntax.hl-sq': 'Single Quotes',
  'syntax.hl-dq': 'Double Quotes',
  'syntax.hl-ab': 'Angle Brackets < >',
  'syntax.hl-sb': 'Square Brackets [ ]',

  // ---- common additions (worldbook stage) ----
  'common.on': 'On',
  'common.off': 'Off',

  // ---- shared.header / shared.confirm / shared.prompt / shared.editorShell: worldbook workspace ----
  'header.mode.worldbook': 'Worldbook',
  'worldbook.header.new': 'New Worldbook',
  'worldbook.header.delete': 'Delete Worldbook',
  'worldbook.header.switch': 'Switch Worldbook',
  'worldbook.confirm.switch.title': 'Switch worldbook?',
  'worldbook.confirm.switch.message': 'Switch to worldbook <strong>{name}</strong>? Unsaved changes to the current worldbook will be lost.',
  'worldbook.confirm.delete.title': 'Delete worldbook?',
  'worldbook.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'worldbook.confirm.closePanel.item': 'Worldbook: {name}',
  'worldbook.prompt.new.title': 'New worldbook name',
  'worldbook.prompt.new.placeholder': 'Worldbook name',
  'worldbook.editorShell.empty': 'Loading worldbook list…',
  'worldbook.editorShell.emptyEntry': 'Select an entry, or create a new one',

  // ---- shared.header / shared.confirm / shared.prompt / shared.editorShell: character workspace (TODO.md stage 2) ----
  'header.mode.character': 'Character',
  'character.header.new': 'New Character',
  'character.header.delete': 'Delete Character',
  'character.header.switch': 'Switch Character',
  'character.confirm.switch.title': 'Switch character?',
  'character.confirm.switch.message': 'Switch to character <strong>{name}</strong>? Unsaved changes to the current character will be lost.',
  'character.confirm.delete.title': 'Delete character?',
  'character.confirm.delete.message': 'This will permanently remove <strong>{name}</strong>. This cannot be undone.',
  'character.confirm.closePanel.item': 'Character: {name}',
  'character.prompt.new.title': 'New character name',
  'character.prompt.new.placeholder': 'Character name',
  'character.editorShell.empty': 'No character loaded yet — create or select one',
  'character.editorShell.emptyField': 'Select a field to edit',

  // ---- worldbook.sidebar ----
  'worldbook.sidebar.title': 'Worldbook Entries',
  'worldbook.sidebar.newEntry': '+ New',
  'worldbook.sidebar.empty': 'No worldbook loaded yet — pick one from the top right, or create a new one',
  'worldbook.sidebar.defaultGroupName': 'Group ({count})',
  'worldbook.sidebar.tools': '🛠 Batch Tools',

  // ---- worldbook.tools: batch tools floating panel ----
  'worldbook.tools.title': 'Batch Tools',
  'worldbook.tools.selectedCount': '{count} entries selected',
  'worldbook.tools.enableLabel': 'Enabled State',
  'worldbook.tools.enableSelected': 'Enable Selected',
  'worldbook.tools.disableSelected': 'Disable Selected',
  'worldbook.tools.activationLabel': 'Activation',
  'worldbook.tools.noSelection': 'Select some entries on the left first (Ctrl/Shift for multi-select)',
  'worldbook.tools.applied': 'Applied to {count} entries',

  // ---- worldbook.toast ----
  'worldbook.toast.listFailed': 'Failed to fetch worldbook list: {msg}',
  'worldbook.toast.loadFailed': 'Failed to load worldbook: {msg}',
  'worldbook.toast.notFound': 'Worldbook {name} not found',
  'worldbook.toast.loaded': 'Loaded worldbook {name}',
  'worldbook.toast.noneSelected': 'No worldbook loaded yet',
  'worldbook.toast.noDataToSave': 'No worldbook to save',
  'worldbook.toast.saved': 'Saved worldbook {name}',
  'worldbook.toast.saveFailed': 'Failed to save worldbook: {msg}',
  'worldbook.toast.duplicateName': 'A worldbook with that name already exists',
  'worldbook.toast.created': 'Created worldbook {name}',
  'worldbook.toast.createFailed': 'Failed to create worldbook: {msg}',
  'worldbook.toast.deleted': 'Deleted worldbook {name}',
  'worldbook.toast.deleteFailed': 'Failed to delete worldbook: {msg}',
  'worldbook.toast.loadFirst': 'Load or create a worldbook first',
  'worldbook.toast.created2': 'New entry created',
  'worldbook.toast.entryDeleted': 'Deleted',

  // ---- worldbook.confirm ----
  'worldbook.confirm.deleteEntry.title': 'Delete entry?',
  'worldbook.confirm.deleteEntry.message': 'This will permanently remove <strong>{name}</strong> from the worldbook.',

  // ---- worldbook.activation: the three mutually-exclusive activation modes ----
  'worldbook.activation.keyWord': 'Keyword',
  'worldbook.activation.constant': 'Constant',
  'worldbook.activation.vectorized': 'Vectorized',

  // ---- worldbook.editor ----
  'worldbook.editor.placeholder': 'Edit the worldbook entry content here…',

  // ---- worldbook.settings: entry settings form ----
  'worldbook.settings.enabled': 'Enabled',
  'worldbook.settings.commentLabel': 'Title / Comment',
  'worldbook.settings.commentPlaceholder': 'Entry title (for your reference only, not matched against)',
  'worldbook.settings.keysLabel': 'Primary Keys (one per line)',
  'worldbook.settings.keysPlaceholder': 'keyword1\nkeyword2',
  'worldbook.settings.activationLabel': 'Activation',
  'worldbook.settings.selective': 'Require secondary keys too',
  'worldbook.settings.keysSecondaryLabel': 'Secondary Keys (one per line)',
  'worldbook.settings.logicLabel': 'Logic',
  'worldbook.settings.positionLabel': 'Position',
  'worldbook.settings.depthLabel': 'Depth',
  'worldbook.settings.roleLabel': 'Role',
  'worldbook.settings.orderLabel': 'Insertion Order (lower = earlier)',
  'worldbook.settings.probabilityLabel': 'Trigger by probability',
  'worldbook.settings.excludeRecursion': "Don't scan for recursion (other entries can't trigger it)",
  'worldbook.settings.preventRecursion': "Prevent recursion (won't trigger other entries)",
  'worldbook.settings.delayUntilRecursion': 'Delay until recursion',
  'worldbook.settings.scanDepthLabel': 'Scan Depth',
  'worldbook.settings.sameAsGlobal': 'Same as global',
  'worldbook.settings.caseSensitiveLabel': 'Case Sensitive',
  'worldbook.settings.matchWholeWordsLabel': 'Match Whole Words',
  'worldbook.settings.stickyLabel': 'Sticky',
  'worldbook.settings.cooldownLabel': 'Cooldown',
  'worldbook.settings.delayLabel': 'Delay',
  'worldbook.settings.groupLabel': 'Inclusion Group',
  'worldbook.settings.groupPlaceholder': 'Only one entry per group wins, by weight/priority',
  'worldbook.settings.groupPrioritized': 'Prioritize this group',

  // ---- worldbook.position ----
  'worldbook.position.beforeChar': 'Before Char Defs',
  'worldbook.position.afterChar': 'After Char Defs',
  'worldbook.position.beforeExample': 'Before Example Messages',
  'worldbook.position.afterExample': 'After Example Messages',
  'worldbook.position.beforeAuthorsNote': "Before Author's Note",
  'worldbook.position.afterAuthorsNote': "After Author's Note",
  'worldbook.position.atDepth': 'At Depth ⚙',
  'worldbook.position.outlet': 'Outlet',

  // ---- worldbook.logic ----
  'worldbook.logic.andAny': 'AND ANY',
  'worldbook.logic.notAll': 'NOT ALL',
  'worldbook.logic.notAny': 'NOT ANY',
  'worldbook.logic.andAll': 'AND ALL',

  // ---- worldbook.role ----
  'worldbook.role.default': 'Default',
  'worldbook.role.system': 'System',
  'worldbook.role.user': 'User',
  'worldbook.role.assistant': 'Assistant',

  // ---- character.field ----
  'character.field.description': 'Description',
  'character.field.scenario': 'Scenario',
  'character.field.mesExample': 'Example Messages',
  'character.field.personality': 'Personality',
  'character.field.systemPrompt': 'System Prompt',
  'character.field.postHistoryInstructions': "Jailbreak / Post-History Instructions",
  'character.field.depthPrompt': "Author's Note",

  // ---- character.sidebar ----
  'character.sidebar.title': 'Character',
  'character.sidebar.empty': 'No character loaded yet — create or select one',
  'character.sidebar.fieldsLabel': 'Content Fields',
  'character.sidebar.greetingsLabel': 'Greetings',
  'character.sidebar.addGreeting': '+ Greeting',
  'character.sidebar.regexMode': 'Regex',
  'character.sidebar.fieldsMode': '← Fields',
  'character.sidebar.deleteGreetingTitle': 'Delete this greeting',
  'character.sidebar.greetingLabel': 'Greeting {n}',

  // ---- character.editor ----
  'character.editor.placeholder': 'Edit content here…',
  'character.editor.depthLabel': 'Depth',
  'character.editor.roleLabel': 'Role',

  // ---- character.toast ----
  'character.toast.listFailed': 'Failed to fetch character list: {msg}',
  'character.toast.loadFailed': 'Failed to load character: {msg}',
  'character.toast.notFound': 'Character {name} not found',
  'character.toast.loaded': 'Loaded character {name}',
  'character.toast.noneSelected': 'No character loaded yet',
  'character.toast.noDataToSave': 'No character to save',
  'character.toast.saved': 'Saved character {name}',
  'character.toast.saveFailed': 'Failed to save character: {msg}',
  'character.toast.duplicateName': 'A character with that name already exists',
  'character.toast.created': 'Created character {name}',
  'character.toast.createFailed': 'Failed to create character: {msg}',
  'character.toast.deleted': 'Deleted character {name}',
  'character.toast.deleteFailed': 'Failed to delete character: {msg}',
  'character.toast.loadFirst': 'Load or create a character first',
  'character.toast.greetingDeleted': 'Greeting deleted',
  'character.toast.needAtLeastOneGreeting': 'At least one greeting must remain',

  // ---- character.confirm ----
  'character.confirm.deleteGreeting.title': 'Delete this greeting?',
  'character.confirm.deleteGreeting.message': 'This will permanently remove this greeting. This cannot be undone.',
  'character.confirm.newCharacter.message': 'Creating a new character will discard all unsaved changes. Are you sure you want to continue?',

  // ---- character.metaForm: creator info/tags/talkativeness/worldbook rebind, TODO.md stage 2b ----
  'character.metaForm.title': 'ℹ️ Character Info',
  'character.metaForm.favLabel': '⭐ Favorite',
  'character.metaForm.creatorLabel': 'Creator',
  'character.metaForm.versionLabel': 'Version',
  'character.metaForm.creatorNotesLabel': "Creator's Notes",
  'character.metaForm.tagsLabel': 'Tags',
  'character.metaForm.tagsPlaceholder': 'Comma-separated, e.g.: fantasy, oc',
  'character.metaForm.talkativenessLabel': 'Talkativeness',
  'character.metaForm.worldbookLabel': 'Bound Worldbook',
  'character.metaForm.worldbookNone': '(Not bound)',
} satisfies Record<keyof typeof zhCN, string> satisfies LocaleTable
