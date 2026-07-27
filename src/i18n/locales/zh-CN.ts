import type { LocaleTable } from '../types'
// zh-CN 是这份 locale 表的"参照表"——index.ts 用 `keyof typeof zhCN` 反推出 LocaleKey 联合类型，
// en.ts 漏翻译某个 key 会在编译期直接报错（见 i18n/index.ts 顶部注释）。所以新增文案时，
// 永远先加在这份表里，再去 en.ts 补对应英文，顺序反过来 TS 不会帮你查漏。
//
// key 命名规范：域.场景.用途，按域分块排列，zh-CN.ts 与 en.ts 严格保持顺序一一对应。
// - common.*：跨域原子词，所有域通用、文字不随上下文变化的按钮/标签
// - shared.*：跨域复用的通用组件/逻辑文案
// - preset/regex/worldbook/character.*：各业务域专属文案，同场景key结构保持一致
export default {
  // ========================================
  // common：跨域原子词
  // ========================================
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',
  'common.close': '关闭',
  'common.confirm': '确认',
  'common.create': '创建',
  'common.switch': '切换',
  'common.new': '新建',
  'common.load': '加载',
  'common.hidden': '隐藏',
  'common.unnamed': '(未命名)',
  'common.messages': '消息',
  'common.tokens': 'tok',
  'common.lines': '{count} 行',
  'common.chars': '{count} 字符',
  'common.on': '开',
  'common.off': '关',

  // ========================================
  // shared：跨域通用组件/逻辑
  // ========================================
  // ---- 顶部工具栏 ----
  'shared.header.save': '💾 保存{star}',
  'shared.header.reload': '↻ 重新加载',
  'shared.header.settings': '⚙ 设置',
  'shared.header.meta': 'ⓘ 元信息',
  'shared.header.mode.preset': '预设',
  'shared.header.mode.regex': '正则',
  'shared.header.mode.worldbook': '世界书',
  'shared.header.mode.character': '角色卡',

  // ---- 侧边栏 ----
  'shared.sidebar.bind': '🔗 绑定',
  'shared.sidebar.unbind': '🔓 解绑',


  // ---- 移动端专属 ----
  'shared.mobile.sidebar': '侧边栏',
  'shared.mobile.tools': '更多工具',

  // ---- 全局设置弹窗 ----
  'shared.settings.title': '编辑器设置',
  'shared.settings.language': '界面语言',
  'shared.settings.resetDefaults': '恢复默认',
  'shared.settings.fontSize': '字体大小',
  'shared.settings.fontFamily': '字体',
  'shared.settings.syntaxColors': '语法高亮颜色',

  // ---- 跨域通用toast ----
  'shared.toast.settingsReset': '设置已重置',

  // ---- 通用确认弹窗 ----
  'shared.confirm.unsaved.title': '未保存的更改',
  'shared.confirm.unsaved.message': '当前有未保存的更改，确定要放弃吗？',
  'shared.confirm.closePanel.title': '还有未保存的更改',
  'shared.confirm.closePanel.message': '以下工作区还有未保存的更改。关闭面板只是隐藏界面，这些更改仍留在内存里，下次打开会自动恢复——但如果之后刷新或关闭了 SillyTavern 页面，它们就会丢失，记得先保存：',

  // ---- 通用组件 ----
  'shared.settingsDock.title': '⚙ 设置',
  'shared.floatingPanel.toggleFloat': '切换悬浮模式',
  'shared.highlightedEditor.cursor': '行 {line}，列 {col}',

  // ---- 语法高亮标签 ----
  'shared.syntax.hl-b': '花括号 {{ }}',
  'shared.syntax.hl-k': '关键字',
  'shared.syntax.hl-s': '分隔符 (::)',
  'shared.syntax.hl-v': '变量名',
  'shared.syntax.hl-c': '变量值',
  'shared.syntax.hl-cm': '注释',
  'shared.syntax.hl-m': '宏内容',
  'shared.syntax.hl-sq': '单引号',
  'shared.syntax.hl-dq': '双引号',
  'shared.syntax.hl-ab': '尖括号 < >',
  'shared.syntax.hl-sb': '方括号 [ ]',

  // ========================================
  // preset：预设域
  // ========================================
  // ---- 头部工具栏 ----
  'preset.header.copyBlocks': '⇆ 复制块',
  'preset.header.search': '🔎 搜索',
  'preset.header.varNav': '📊 变量导航',
  'preset.header.preview': '👁 预览',
  'preset.header.new': '新建预设',
  'preset.header.delete': '删除预设',
  'preset.header.switch': '切换预设',
  'preset.header.noneLoaded': '(未加载任何预设)',

  // ---- 提示 ----
  'preset.toast.loadFailed': '加载失败：{msg}',
  'preset.toast.noDataToSave': '没有可保存的数据',
  'preset.toast.saved': '已保存：{name}',
  'preset.toast.saveFailed': '保存失败：{msg}',
  'preset.toast.created': '已创建：{name}',
  'preset.toast.createFailed': '创建失败：{msg}',
  'preset.toast.deleted': '已删除：{name}',
  'preset.toast.deleteFailed': '删除失败：{msg}',
  'preset.toast.nothingToCopy': '没有可复制的内容',
  'preset.toast.copied': '已复制',
  'preset.toast.copyFailed': '复制失败，请查看控制台',
  'preset.toast.loadFirst': '请先加载一份预设',
  'preset.toast.listFailed': '无法获取预设列表：{msg}',
  'preset.toast.notFound': '未找到预设：{name}',
  'preset.toast.loaded': '已加载：{name}',
  'preset.toast.cantLoadContext': '无法从 SillyTavern 加载当前预设：{msg}',
  'preset.toast.noSelected': 'SillyTavern 中当前没有选中的预设',
  'preset.toast.blockCreated': '已创建',
  'preset.toast.blockDeleted': '已删除',
  'preset.toast.blockHidden': '已隐藏',
  'preset.toast.blockAdded': '已添加',
  'preset.toast.duplicateName': '已存在同名预设',
  'preset.toast.reloadNote': '注意：这是当前打开的预设——请在主编辑器中重新加载以查看更改',
  'preset.toast.copiedBlocks': '已复制 {n} 个块 {dir}',
  'preset.toast.listFailedCopyPanel': '无法获取预设列表：{msg}',
  'preset.toast.loadFailedCopyPanel': '加载失败：{msg}',
  'preset.toast.select2PlusBlocks': '请选择至少 2 个顶层块',
  'preset.toast.boundBlocks': '已绑定 {count} 个块',
  'preset.toast.unbound': '已解除绑定',
  'preset.toast.replaced1': '已替换 1 处',
  'preset.toast.previewFailed': '预览失败：{msg}',
  'preset.toast.renderedFullPrompt': '已渲染完整提示词',
  'preset.toast.renderedBlocks': '已渲染 {count} 个块',
  'preset.toast.cannotDeleteMarker': '不能删除Marker',
  'preset.toast.cannotHideMarker': '不能隐藏Marker',
  'preset.toast.selectPresetFailed': '切换ST主菜单预设失败，可能导致显示数据不精确',

  // ---- 确认弹窗 ----
  'preset.confirm.switch.title': '切换预设？',
  'preset.confirm.switch.message': '切换到预设 <strong>{name}</strong>？当前预设的未保存更改将丢失。',
  'preset.confirm.delete.title': '删除预设？',
  'preset.confirm.delete.message': '这将永久移除 <strong>{name}</strong>，无法撤销。',
  'preset.confirm.deleteBlock.title': '删除提示词块？',
  'preset.confirm.deleteBlock.message': '这将从预设中永久移除 <strong>{name}</strong>。',
  'preset.confirm.reload.title': '重新加载预设？',
  'preset.confirm.reload.message': '重新加载预设 <strong>{name}</strong>？当前预设的未保存更改将丢失。',
  'preset.confirm.reload.confirm': '重新加载',
  'preset.confirm.removeBlock.title': '移除块？',
  'preset.confirm.removeBlock.message': '从列表中移除 <strong>{name}</strong>？这仅影响当前复制会话——不会写入磁盘，直到你点击保存。',
  'preset.confirm.removeBlock.confirm': '移除',
  'preset.confirm.closeUnsaved.title': '不保存就关闭？',
  'preset.confirm.closeUnsaved.message': '你在一侧或两侧有未保存的复制/删除更改。',
  'preset.confirm.closePanel.item': '预设：{name}',

  // ---- 输入弹窗 ----
  'preset.prompt.new.title': '新预设名称',
  'preset.prompt.new.placeholder': '预设名称',

  // ---- 侧边栏 ----
  'preset.sidebar.title': '提示词块 ({count})',
  'preset.sidebar.newBlock': '+ 新建',
  'preset.sidebar.hiddenBlock': '+ 隐藏块',
  'preset.sidebar.hiddenTitle': '不在当前生效顺序里',
  'preset.sidebar.settingsPanel': '设置面板（名称/角色）',

  // ---- 块设置表单 ----
  'preset.settings.name': '名称',
  'preset.settings.namePlaceholder': '给这个块起个名字',
  'preset.settings.role': '角色',
  'preset.settings.markerHint': '这是一个 marker 块（{id}），内容由 SillyTavern 内部生成，这里的角色/名称改动可能不影响实际渲染。',
  'preset.settings.empty': '选择一个块以编辑其设置',

  // ---- 搜索替换 ----
  'preset.search.placeholder': '搜索所有块…',
  'preset.search.replacePlaceholder': '替换…',
  'preset.search.replace': '替换',
  'preset.search.replaceAll': '替换全部',
  'preset.search.results': '{count} 个结果',

  // ---- 变量导航面板 ----
  'preset.varPanel.title': '📊 变量',
  'preset.varPanel.filter': '筛选…',
  'preset.varPanel.prev': '◀ 上',
  'preset.varPanel.next': '下 ▶',

  // ---- 预览面板 ----
  'preset.preview.title': '👁 提示词预览',
  'preset.preview.collapseExpand': '折叠/展开全部',
  'preset.preview.modeBlocks': '逐块',
  'preset.preview.modeRaw': '最终请求',
  'preset.preview.hintBlocks': '来自 SillyTavern 提示词管理器的真实逐块渲染。高亮文本是被替换进来的（宏/正则等）——并非块源码中的字面量。',
  'preset.preview.hintRaw': 'SillyTavern 即将发送给 API 的精确 messages 数组——通过真实生成捕获，并在之后立即取消，因此不会实际发送任何内容。',
  'preset.preview.generate': '▶ 生成',
  'preset.preview.copy': '📋 复制',
  'preset.preview.generating': '⏳ 生成中…',
  'preset.preview.collapseExpandSingle': '折叠/展开',
  'preset.preview.emptyBlocks': '点击"生成"进行真实的逐块渲染（这会运行一次实际的 dry-run 生成）。',
  'preset.preview.emptyRaw': '点击"生成"捕获最终请求——这会短暂启动一次真实生成并立即取消。',

  // ---- 变量弹窗 ----
  'preset.varPopup.hit': '{count} 处匹配',
  'preset.varPopup.hitSingle': '{count} 处匹配',

  // ---- 跨预设复制面板 ----
  'preset.copyPanel.title': '⇆ 跨预设复制提示词块',
  'preset.copyPanel.selectPreset': '选择预设…',
  'preset.copyPanel.selectAll': '全部',
  'preset.copyPanel.clearAll': '无',
  'preset.copyPanel.noBlocks': '没有块',
  'preset.copyPanel.pickPreset': '选择并加载一个预设',
  'preset.copyPanel.copyRight': '复制选中项 → 右侧',
  'preset.copyPanel.copyLeft': '复制选中项 → 左侧',
  'preset.copyPanel.removeBlock': '从此列表中移除',
  'preset.copyPanel.dirRight': '→ 右侧',
  'preset.copyPanel.dirLeft': '→ 左侧',
  'preset.copyPanel.loadBothFirst': '请先加载两侧预设',
  'preset.copyPanel.selectBlocksFirst': '请先选择要复制的块',

  // ---- 预设元信息（模型参数） ----
  'preset.metaForm.title': 'ⓘ 预设参数',
  'preset.metaForm.contextLabel': '最大上下文 (Token)',
  'preset.metaForm.maxTokensLabel': '最大回复长度 (Token)',
  'preset.metaForm.repliesLabel': '回复条数',
  'preset.metaForm.streamLabel': '流式传输',
  'preset.metaForm.squashLabel': '压缩连续系统消息',
  'preset.metaForm.samplingToggle': '采样参数',
  'preset.metaForm.temperatureLabel': 'Temperature',
  'preset.metaForm.topPLabel': 'Top P',
  'preset.metaForm.freqPenaltyLabel': 'Frequency Penalty',
  'preset.metaForm.presPenaltyLabel': 'Presence Penalty',
  'preset.metaForm.repPenaltyLabel': 'Repetition Penalty',
  'preset.metaForm.minPLabel': 'Min P',
  'preset.metaForm.topKLabel': 'Top K',
  'preset.metaForm.topALabel': 'Top A',
  'preset.metaForm.seedLabel': 'Seed',
  'preset.metaForm.seedHint': '-1 表示随机',

  // ---- 编辑区空状态 ----
  'preset.editorShell.empty': '选择一个块进行编辑',
  'preset.editorShell.loading': '正在从上下文加载预设…',

  // ========================================
  // regex：正则域
  // ========================================
  // ---- 侧边栏 ----
  'regex.sidebar.title': '正则脚本 ({count})',
  'regex.sidebar.newScript': '+ 新建',
  'regex.sidebar.empty': '还没有绑定的正则',
  'regex.sidebar.toggleTitle': '启用/禁用',
  'regex.sidebar.deleteTitle': '删除',

  // ---- 内容编辑 ----
  'regex.editor.edit': '✏️ 编辑',
  'regex.editor.preview': '👁 预览',
  'regex.editor.plainText': '纯文本',
  'regex.editor.html': 'HTML',
  'regex.editor.settingsPanel': '设置面板',
  'regex.editor.placeholder': '用 {{match}} 引用整个匹配，$1 / $2 引用捕获组',
  'regex.editor.testText': '测试文本',
  'regex.editor.testPlaceholder': '粘贴一段消息文本，切到「预览」看效果…',
  'regex.editor.invalidFindRegex': '查找正则语法无效，预览会原样返回输入文本',
  'regex.editor.previewLimitation': '预览只做本地查找/替换/修剪，不解析宏、不代表作用范围与深度限制。',
  'regex.editor.previewError': '预览出错: {msg}',

  // ---- 设置表单 ----
  'regex.settings.enabled': '启用',
  'regex.settings.findRegexLabel': '查找正则表达式',
  'regex.settings.findRegexPlaceholder': '/pattern/flags',
  'regex.settings.findRegexInvalid': '正则语法无效',
  'regex.settings.scriptNameLabel': '脚本名称',
  'regex.settings.scriptNamePlaceholder': '给这条正则起个名字',
  'regex.settings.placementLabel': '作用范围',
  'regex.settings.surfaceLabel': '表层替换',
  'regex.settings.displayOnly': '仅影响显示',
  'regex.settings.promptOnly': '仅影响后端提示词',
  'regex.settings.both': '两者都影响',
  'regex.settings.advancedToggle': '高级选项',
  'regex.settings.trimLabel': '修剪掉（每行一条）',
  'regex.settings.runOnEdit': '在编辑时运行',
  'regex.settings.substituteLabel': '正则表达式查找的宏',
  'regex.settings.minDepth': '最小深度',
  'regex.settings.maxDepth': '最大深度',
  'regex.settings.depthPlaceholder': '无限',

  // ---- 选项枚举 ----
  'regex.placement.userInput': '用户输入',
  'regex.placement.aiOutput': 'AI 输出',
  'regex.placement.quickCommand': '快捷命令',
  'regex.placement.worldInfo': '世界书',
  'regex.placement.reasoning': '推理',
  'regex.substitute.none': '不替换',
  'regex.substitute.raw': '替换（原始）',
  'regex.substitute.escaped': '替换（转义）',

  // ---- 确认弹窗 ----
  'regex.confirm.delete.title': '删除正则脚本？',
  'regex.confirm.delete.message': '这将永久移除 <strong>{name}</strong>。',

  // ---- 编辑区空状态 ----
  'regex.editorShell.empty': '选一条正则，或者新建一条',

  // ========================================
  // worldbook：世界书域
  // ========================================
  // ---- 头部工具栏 ----
  'worldbook.header.new': '新建世界书',
  'worldbook.header.importFromCharacter': '从角色卡导入',
  'worldbook.header.delete': '删除世界书',
  'worldbook.header.switch': '切换世界书',
  'worldbook.header.noneLoaded': '(未加载世界书)',

  // ---- 提示 ----
  'worldbook.toast.listFailed': '获取世界书列表失败：{msg}',
  'worldbook.toast.loadFailed': '加载世界书失败：{msg}',
  'worldbook.toast.notFound': '找不到世界书 {name}',
  'worldbook.toast.loaded': '已加载世界书 {name}',
  'worldbook.toast.noneSelected': '还没有加载任何世界书',
  'worldbook.toast.noDataToSave': '没有可保存的世界书',
  'worldbook.toast.saved': '已保存世界书 {name}',
  'worldbook.toast.saveFailed': '保存世界书失败：{msg}',
  'worldbook.toast.duplicateName': '已经有同名的世界书了',
  'worldbook.toast.created': '已创建世界书 {name}',
  'worldbook.toast.createFailed': '创建世界书失败：{msg}',
  'worldbook.toast.deleted': '已删除世界书 {name}',
  'worldbook.toast.deleteFailed': '删除世界书失败：{msg}',
  'worldbook.toast.loadFirst': '请先加载或新建一个世界书',
  'worldbook.toast.importNoBook': '当前角色卡没有内嵌世界书',
  'worldbook.toast.imported': '已从角色卡导入 {count} 条条目到世界书 {name}',
  'worldbook.toast.importFailed': '从角色卡导入失败：{msg}',
  'worldbook.toast.created2': '已新建条目',
  'worldbook.toast.entryDeleted': '已删除',

  // ---- 确认弹窗 ----
  'worldbook.confirm.switch.title': '切换世界书？',
  'worldbook.confirm.switch.message': '切换到世界书 <strong>{name}</strong>？当前世界书的未保存更改将丢失。',
  'worldbook.confirm.delete.title': '删除世界书？',
  'worldbook.confirm.delete.message': '这将永久移除 <strong>{name}</strong>，无法撤销。',
  'worldbook.confirm.deleteEntry.title': '删除条目？',
  'worldbook.confirm.deleteEntry.message': '这将从世界书中永久移除 <strong>{name}</strong>。',
  'worldbook.confirm.closePanel.item': '世界书：{name}',

  // ---- 输入弹窗 ----
  'worldbook.prompt.new.title': '新世界书名称',
  'worldbook.prompt.new.placeholder': '世界书名称',
  'worldbook.prompt.import.title': '导入为新世界书',
  'worldbook.prompt.import.suffix': '的世界书',

  // ---- 侧边栏 ----
  'worldbook.sidebar.title': '世界书条目 ({count})',
  'worldbook.sidebar.newEntry': '+ 新建',
  'worldbook.sidebar.empty': '还没有加载世界书，从右上角选一个，或者新建一个',
  'worldbook.sidebar.defaultGroupName': '分组 ({count})',
  'worldbook.sidebar.tools': '🛠 批量',

  // ---- 批量工具面板 ----
  'worldbook.tools.title': '批量工具',
  'worldbook.tools.selectedCount': '已选中 {count} 个条目',
  'worldbook.tools.enableLabel': '启用状态',
  'worldbook.tools.enableSelected': '启用选中',
  'worldbook.tools.disableSelected': '禁用选中',
  'worldbook.tools.activationLabel': '激活方式',
  'worldbook.tools.noSelection': '先在左侧列表里选中一些条目（Ctrl/Shift 多选）',
  'worldbook.tools.applied': '已应用到 {count} 个条目',

  // ---- 选项枚举 ----
  'worldbook.activation.keyWord': '🟢 关键词',
  'worldbook.activation.constant': '🔵 恒定',
  'worldbook.activation.vectorized': '🔗 向量化',
  'worldbook.position.beforeChar': '角色定义之前',
  'worldbook.position.afterChar': '角色定义之后',
  'worldbook.position.beforeExample': '示例对话之前',
  'worldbook.position.afterExample': '示例对话之后',
  'worldbook.position.beforeAuthorsNote': '作者注释之前',
  'worldbook.position.afterAuthorsNote': '作者注释之后',
  'worldbook.position.atDepth': '在深度 ⚙',
  'worldbook.position.outlet': '锚点',
  'worldbook.logic.andAny': 'AND 任意',
  'worldbook.logic.notAll': 'NOT 全部',
  'worldbook.logic.notAny': 'NOT 任意',
  'worldbook.logic.andAll': 'AND 全部',
  'worldbook.role.default': '默认',
  'worldbook.role.system': '系统',
  'worldbook.role.user': '用户',
  'worldbook.role.assistant': '助手',

  // ---- 编辑器 ----
  'worldbook.editor.placeholder': '在这里编辑世界书条目的内容…',

  // ---- 条目设置表单 ----
  'worldbook.settings.enabled': '启用',
  'worldbook.settings.commentLabel': '标题 / 备注',
  'worldbook.settings.commentPlaceholder': '条目标题（仅用于识别，不会被激活匹配）',
  'worldbook.settings.keysLabel': '主要关键词（英文逗号分隔）',
  'worldbook.settings.keysPlaceholder': '关键词1, 关键词2',
  'worldbook.settings.activationLabel': '激活方式',
  'worldbook.settings.selective': '需要同时满足次要关键词',
  'worldbook.settings.keysSecondaryLabel': '次要关键词（英文逗号分隔）',
  'worldbook.settings.logicLabel': '逻辑',
  'worldbook.settings.positionLabel': '插入位置',
  'worldbook.settings.depthLabel': '深度',
  'worldbook.settings.roleLabel': '角色',
  'worldbook.settings.orderLabel': '插入顺序（数值越小越靠前）',
  'worldbook.settings.probabilityLabel': '按概率触发',
  'worldbook.settings.excludeRecursion': '不参与递归扫描（不会被其他条目扫到）',
  'worldbook.settings.preventRecursion': '阻止递归（不会触发其他条目）',
  'worldbook.settings.delayUntilRecursion': '延迟到递归阶段生效',
  'worldbook.settings.scanDepthLabel': '扫描深度',
  'worldbook.settings.sameAsGlobal': '跟随全局设置',
  'worldbook.settings.caseSensitiveLabel': '区分大小写',
  'worldbook.settings.matchWholeWordsLabel': '全词匹配',
  'worldbook.settings.stickyLabel': '粘滞',
  'worldbook.settings.cooldownLabel': '冷却',
  'worldbook.settings.delayLabel': '延迟',
  'worldbook.settings.groupLabel': '互斥组',
  'worldbook.settings.groupPlaceholder': '同组内按权重/优先级只取一个',
  'worldbook.settings.groupPrioritized': '组内优先',

  // ---- 编辑区空状态 ----
  'worldbook.editorShell.empty': '正在加载世界书列表…',
  'worldbook.editorShell.emptyEntry': '选一个条目，或者新建一个',

  // ========================================
  // character：角色卡域
  // ========================================
  // ---- 头部工具栏 ----
  'character.header.new': '新建角色',
  'character.header.delete': '删除角色',
  'character.header.switch': '切换角色',
  'character.header.noneLoaded': '(未加载角色)',

  // ---- 提示 ----
  'character.toast.listFailed': '获取角色列表失败：{msg}',
  'character.toast.loadFailed': '加载角色失败：{msg}',
  'character.toast.notFound': '找不到角色 {name}',
  'character.toast.loaded': '已加载角色 {name}',
  'character.toast.noneSelected': '还没有加载任何角色',
  'character.toast.noDataToSave': '没有可保存的角色',
  'character.toast.saved': '已保存角色 {name}',
  'character.toast.saveFailed': '保存角色失败：{msg}',
  'character.toast.duplicateName': '已经有同名的角色了',
  'character.toast.created': '已创建角色 {name}',
  'character.toast.createFailed': '创建角色失败：{msg}',
  'character.toast.deleted': '已删除角色 {name}',
  'character.toast.deleteFailed': '删除角色失败：{msg}',
  'character.toast.loadFirst': '请先加载或新建一个角色',
  'character.toast.greetingDeleted': '已删除开场白',
  'character.toast.needAtLeastOneGreeting': '至少要保留一条开场白',

  // ---- 确认弹窗 ----
  'character.confirm.switch.title': '切换角色？',
  'character.confirm.switch.message': '切换到角色 <strong>{name}</strong>？当前角色的未保存更改将丢失。',
  'character.confirm.delete.title': '删除角色？',
  'character.confirm.delete.message': '这将永久移除 <strong>{name}</strong>，无法撤销。',
  'character.confirm.deleteGreeting.title': '删除开场白？',
  'character.confirm.deleteGreeting.message': '这将永久移除这条开场白，且不可撤销。',
  'character.confirm.newCharacter.message': '创建新角色将丢弃当前未保存的更改，确定要继续吗？',
  'character.confirm.closePanel.item': '角色卡：{name}',

  // ---- 输入弹窗 ----
  'character.prompt.new.title': '新角色名称',
  'character.prompt.new.placeholder': '角色名称',

  // ---- 侧边栏 ----
  'character.sidebar.title': '角色卡',
  'character.sidebar.empty': '还没有加载任何角色，新建或选择一个',
  'character.sidebar.fieldsLabel': '内容字段',
  'character.sidebar.greetingsLabel': '开场白',
  'character.sidebar.addGreeting': '+ 开场白',
  'character.sidebar.regexMode': '正则',
  'character.sidebar.fieldsMode': '← 字段',
  'character.sidebar.deleteGreetingTitle': '删除这条开场白',
  'character.sidebar.greetingLabel': '开场白 {n}',

  // ---- 编辑器 ----
  'character.editor.placeholder': '在这里编辑内容…',
  'character.editor.depthLabel': '深度',
  'character.editor.roleLabel': '角色',

  // ---- 固定字段标签 ----
  'character.field.description': '角色描述',
  'character.field.systemPrompt': '主要提示词',
  'character.field.postHistoryInstructions': '历史后置指令',
  'character.field.personality': '角色设定摘要',
  'character.field.scenario': '情景',
  'character.field.depthPrompt': '角色备注',
  'character.field.mesExample': '对话示例',

  // ---- 角色元信息 ----
  'character.metaForm.title': 'ⓘ 角色信息',
  'character.metaForm.favLabel': '⭐ 收藏',
  'character.metaForm.creatorLabel': '创作者',
  'character.metaForm.versionLabel': '角色版本',
  'character.metaForm.creatorNotesLabel': '创作者的注释',
  'character.metaForm.tagsLabel': '标签',
  'character.metaForm.tagsPlaceholder': '用逗号分隔，例如：奇幻, 原创',
  'character.metaForm.talkativenessLabel': '话痨度',
  'character.metaForm.creatorToggle': '创作者元数据',
  'character.metaForm.worldbookLabel': '绑定世界书',
  'character.metaForm.worldbookNone': '（未绑定）',

  // ---- 编辑区空状态 ----
  'character.editorShell.empty': '还没有加载任何角色，新建或选择一个',
  'character.editorShell.emptyField': '选一个字段进行编辑',
} satisfies LocaleTable
