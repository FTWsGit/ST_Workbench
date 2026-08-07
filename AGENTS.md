# ST_Workbench — Agent Guide

## Project Doc

| 文件 | 分类 | alwaysApply | description |
|------|------|------------|-------|
| `.doc/项目概览.mdc` | overview | true | ST_Workbench 是什么、管哪四类数据、目录结构怎么组织。新接手项目、不确定整体定位、查找某文件做什么时读。 |
| `.doc/architecture/架构总览.mdc` | architecture | true | Pinia store 职责边界与多 domain 路由：标签页决定编辑区/设置区显示什么，顶栏两行正交轴控制工作区与子集合。改 store 间分工、加新 domain、改顶栏路由、加整份文档级元信息字段时读。 |
| `.doc/architecture/新增功能套路表.mdc` | architecture | false | 查表型文档：常见'加一个 XXX 功能'该抄哪个现成模式，一行任务对一行答案。新加一类功能前先来这查有没有现成模式可抄。 |
| `.doc/architecture/状态与持久化.mdc` | architecture | false | 各 domain store 的内部数据结构、与 ST API 的数据契约、dirty/settings 持久化机制。改 presetStore/worldbookStore/characterStore 内部字段（prompts/order/selectedGi/flatNodes/虚拟字段路由）、改 api/presetApi/characterApi/worldbookApi、碰 PresetManager/prompt_order/marker/selectPresetByName、改 settings 持久化或 dirty 追踪、改 composables/useDirtyFlag/usePreviewEngine/useScriptList 时读。 |
| `.doc/features/正则本地模拟.mdc` | feature | false | regexEngine.ts：正则脚本测试栏的本地模拟。改 regexEngine/RegexContentEditor 测试栏、或排查'正则预览不准/trim 不生效/正则无效'类症状时读。跟 Precise Preview 是两套不相关的机制，见同目录「精确预览」。 |
| `.doc/features/精确预览.mdc` | feature | false | Precise Preview：真实调用 SillyTavern 自身渲染管线生成预览。改 PreviewPanel、macroAwareDiff/wordDiff 高亮算法、或排查'预览不准/预览不自动同步'类症状时读。跟正则脚本的本地模拟预览是两套不相关的机制。 |
| `.doc/spec/character.mdc` | spec | false | SillyTavern 角色卡(Character)的原始数据结构与前端 import 读写接口 |
| `.doc/spec/preset.mdc` | spec | false | SillyTavern 预设(Preset)的原始数据结构与前端 import 读写接口 |
| `.doc/spec/worldbook.mdc` | spec | false | SillyTavern 世界书(Worldbook/Lorebook)的原始数据结构与前端 import 读写接口 |
| `.doc/subsystems/国际化.mdc` | subsystem | false | useI18n与文案 key 命名规范。加新 locale key、加新语言、改文案、排查漏翻译兜底、用 LocaleKey 做 typecheck 校验时读。 |
| `.doc/subsystems/性能与调参.mdc` | subsystem | false | 热路径性能教训与可调参数清单。被反馈'卡/掉帧/行号错位/打字延迟'类症状时读——根因和可调参数都在这。改行号测量/按行 diff patch/连续触发控件绑定时先读，避免重蹈已修过的弯路。 |
| `.doc/subsystems/移动端布局.mdc` | subsystem | false | 响应式布局与触屏交互层：off-canvas drawer/bottom sheet 模式、Pointer Events 拖拽机制、FAB 长按拖拽、悬浮窗 Shell。改移动端断点/抽屉状态机/触屏拖拽把手/FAB/任何 useFloatingPanel/usePanelResize/useDragReorder 相关代码时读。 |
| `.doc/subsystems/编辑器内核.mdc` | subsystem | false | HighlightedEditor.vue 四个域共用的宏语法 textarea 内核与 useHighlight.ts 高亮算法。改编辑器、useHighlight/highlightLines/highlightContent、打字调度、行号测量、光标追踪、refreshFont 接口时读。 |
| `.doc/subsystems/部署环境.mdc` | subsystem | false | 宿主环境怪癖：脚本在 about:srcdoc iframe 执行但 UI 挂到顶层文档。改任何涉及 window/document/clipboard/挂载点定位/拖拽监听器绑定的代码、或排查'设置不生效/拖拽没反应/复制失败/样式被覆盖'类症状时读。 |
| `.doc/subsystems/agent.mdc` | subsystem | false | Agent 子系统：跨 preset/worldbook/character 三个 store 的运维助手。agentStore 持有会话状态机、唯一调用 LLM 的入口；工具注册表包装现有 store 方法；走 extensionSettings 持久化、原生 generateRawData + CHAT_COMPLETION_SETTINGS_READY 注入 tools。改 agent/、agentApi.ts、AgentPanel.vue、agent 工具注册时读。 |
| `.doc/features/变量追踪.mdc` | feature | false | 变量追踪：跨 preset/character/worldbook 三域扫描 13 种变量宏（setvar/getvar/addvar/incvar/decvar/hasvar/deletevar × local/global），建索引并按 ST 装配顺序排序，VarPanel/VarPopup 展示、点击 {{var}} 弹浮层、跨域跳转。改 useVarNav/VarPanel/VarPopup/scanVariableMacros/varOpBadge、或排查'变量没扫到/点变量不弹窗/跳转不对'类症状时读。 |

`alwaysApply: true` 的文件是"每次会话都必须知道"的核心知识，AGENTS.md 里也保留了对应的骨架提示（见下方各段）。`alwaysApply: false` 的文件按需读取——每个文件 front matter 的 `description` 写的是"什么场景下该读这个"。

## 注释/文档纪律

- 注释/文档只写**做了什么、为什么**。不写"怎么摸索到的、历史上踩过什么坑、为什么没用另一方案"。对比可行 vs 不可行、踩坑史、淘汰方案是 git log / issue tracker 的事，不进注释
- 注释中绝不提及或引用任何外部文档，不能用诸如`详情见xxx.mdc`、`具体看xxx领域的文档`
- 一句话能写的规矩**不用扩成一段论证**。论证口头给用户讲，不写进文件；AI 读到对应代码/类型自会懂为什么，不用注释先讲一遍
- 不给已有代码补解释性注释

- 文档 只写"项目是什么"，不写用户的要求、展望，不写讨论过程，不写其他方案，不写其他文档的内容
- `description`骨架提示只写**是什么、何时读**。不写写法理论、不写"不是什么"。

## 项目结构纪律
- 项目不应该一味追求最小改动，假如需要抽象，那就抽象；需要统一接口，那就统一接口；需要创造复用逻辑，那就复用
- 永远不要在vue里面使用`<style>`，这会导致产出额外的`dist/style.css`。只在`src/style/main.css`里面写

## 项目测试纪律
- 凡是能用独立脚本先验证正确性/复现 bug 再合并的改动，都应该这么做（纯函数如 `utils.ts` / `regexEngine.ts` / `useHighlight.ts` 用 `npx tsx <file>` 跑）。
- 改完代码一定使用 `npm run typecheck` 和 `npm run build` 来验证

## git commit 纪律
- 创建 git commit 时,禁止添加任何署名 trailer(包括 "Co-Authored-By: ..." 和 "Generated with ..." 等)。提交信息只包含对变更的描述,不要追加任何 AtomCode/模型署名行。此规则优先于内置的提交署名约定
- 关于AGENTS.md, .doc/* 和 .atomcode/* 的修改应该额外提交，不能和项目修改一起提交。对于这些agent类型的提交，comment一定是"agent:..."开头
- 永远使用英文comment

## Commands

| Command | Action |
|---|---|
| `npm run build` | Vite IIFE build → `dist/index.iife.js` |
| `npm run typecheck` | `vue-tsc --noEmit` (no test/lint scripts exist) |

Build is a library `iife` format (`vite.config.js`). No dev server. CSS is manually injected into the host document (`src/main.ts), not by vite plugins.

## Critical Host-Environment Quirk

The script runs inside an `about:srcdoc` iframe (Tavern Helper) but mounts UI onto `window.top.document`. **Bare `window`/`document` references refer to the iframe, not the visible page.** This silently breaks:
- `addEventListener('mousemove', ...)` for drag/resize
- `getComputedStyle(doc.documentElement)` for font/color settings
- Clipboard (`navigator.clipboard.writeText`)
- `ResizeObserver` for layout measurements
- **No native `window.confirm`/`prompt`/`alert`**: They're unreliable in Tauri/WebView2. Use `confirmStore.ask()` / `confirmStore.askInput()`.
- **No native HTML5 drag-and-drop**: It breaks in Tauri/WebView2. All lists use `useDragReorder.ts` (Pointer Events). Touch drag requires a `.wb-drag-handle` with `touch-action: none`.
**Always use** `getHostWindow()` / `getHostDocument()` from `src/composables/hostEnv.ts`. The same file also provides `copyToHostClipboard()` (with execCommand fallback) and `useIsMobile()` (matchMedia-based, listens on host window).

## Data Flow Rules

- **Deep clone before passing to ST APIs**: `JSON.parse(JSON.stringify(data))` (in `api/apiUtils.ts`). Never pass Pinia/Vue reactive proxies — they crash `structuredClone` and can leak into ST's internal state.
- **Settings persistence**: Add new options by editing `Settings` interface + `DEFAULT_SETTINGS` in `src/types.ts` only. `uiStore.saveSettings()` handles localStorage.
- **i18n**: `zh-CN` is the reference locale. Add keys in `zh-CN.ts` first, then in `en.ts`. Call via `uiStore.t(key, params?)`. LocaleKey type catches typos at `npm run typecheck`.
