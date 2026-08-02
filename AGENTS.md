# ST_Workbench — Agent Guide

## Project Doc

| 文件 | alwaysApply | description |
|------|------------|-------|
| `.doc/项目概览.mdc` | true | ST_Workbench 是什么、管哪四类数据、目录结构怎么组织。新接手项目、不确定整体定位、查找某文件做什么时读。 |
| `.doc/架构总览.mdc` | true | Pinia store 职责边界与多 domain 路由：标签页决定编辑区/设置区显示什么，顶栏两行正交轴控制工作区与子集合。改 store 间分工、加新 domain、改顶栏路由、加整份文档级元信息字段、抄'新增功能套路表'时读。各 store 内部数据结构与 dirty/settings 持久化见'状态与持久化'。 |
| `.doc/部署环境.mdc` | false | 宿主环境怪癖：脚本在 about:srcdoc iframe 执行但 UI 挂到顶层文档，所有全局对象量到的都是 iframe 自己。改任何涉及 window/document/clipboard/挂载点定位/拖拽监听器绑定的代码、或排查'设置不生效/拖拽没反应/复制失败/样式被覆盖'类症状时读。 |
| `.doc/移动端布局.mdc` | false | 响应式布局与触屏交互层：off-canvas drawer/bottom sheet 模式、Pointer Events 拖拽机制、FAB 长按拖拽、悬浮窗 Shell。改移动端断点/抽屉状态机/触屏拖拽把手/FAB/任何 useFloatingPanel/usePanelResize/useDragReorder 相关代码时读。 |
| `.doc/状态与持久化.mdc` | false | 各 domain store 的内部数据结构、与 ST API 的数据契约、dirty/settings 持久化机制。改 presetStore/worldbookStore/characterStore 内部字段（prompts/order/selectedGi/flatNodes/虚拟字段路由）、改 api/presetApi/characterApi/worldbookApi、碰 PresetManager/prompt_order/marker/selectPresetByName、改 settings 持久化或 dirty 追踪时读。 |
| `.doc/编辑器内核.mdc` | false | HighlightedEditor.vue 四个域共用的宏语法 textarea 内核与 useHighlight.ts 高亮算法。改编辑器、useHighlight/highlightLines/highlightContent、打字调度、行号测量、光标追踪、refreshFont 接口时读。行号测量与按行 diff patch 的性能教训见'性能与调参'。 |
| `.doc/预览与正则模拟.mdc` | false | Precise Preview 真实渲染 ST 管线（非本地模拟）与 regexEngine.ts 正则本地模拟（有意的简化）。改 PreviewPanel/regexEngine/macroAwareDiff/wordDiff/正则预览、或排查'预览不准/trim 不生效/正则无效'类症状时读。selectPresetByName 契约见'状态与持久化'。 |
| `.doc/国际化.mdc` | false | 自研 useI18n（无 vue-i18n）与文案 key 命名规范。加新 locale key、加新语言、改文案、排查漏翻译兜底、用 LocaleKey 做 typecheck 校验时读。 |
| `.doc/性能与调参.mdc` | false | 热路径性能教训与可调参数清单。被反馈'卡/掉帧/行号错位/打字延迟'类症状时读——根因和可调参数都在这。改行号测量/按行 diff patch/连续触发控件绑定时先读，避免重蹈已修过的弯路。 |
| `.doc/TODO状态.mdc` | false | 未实现的大方向、过渡状态、有意为之的限制清单。判断某功能是否已实现、是否刻意留口子、或排查'预览不自动同步/正则预览不准/共享测试文本'等已知行为时读。 |

`alwaysApply: true` 的文件是"每次会话都必须知道"的核心知识，AGENTS.md 里也保留了对应的骨架提示（见下方各段）。`alwaysApply: false` 的文件按需读取——每个文件 front matter 的 `description` 写的是"什么场景下该读这个"。

## 注释/文档纪律

- 注释只写**做了什么、为什么**。不写"怎么摸索到的、历史上踩过什么坑、为什么没用另一方案"。对比可行 vs 不可行、踩坑史、淘汰方案是 git log / issue tracker 的事，不进注释
- 注释中绝不提及或引用任何外部文档，不能用诸如`详情见xxx.mdc`、`具体看xxx领域的文档`
- 一句话能写的规矩**不用扩成一段论证**。论证口头给用户讲，不写进文件；AI 读到对应代码/类型自会懂为什么，不用注释先讲一遍。
- 注释密度对齐周围代码，不主动给已有代码补解释性注释。

- 文档 只写"项目是什么"，不写用户的要求、展望、不写对 AI 的喊话、不写踩坑史
- `description` / 骨架提示只写**是什么、何时读**。不写写法理论、不写"未来某 skill 会怎么消费它"。
- 凡是能用独立脚本先验证正确性/复现 bug 再合并的改动，都应该这么做（纯函数如 `utils.ts` / `regexEngine.ts` / `useHighlight.ts` 用 `npx tsx <file>` 跑）。

## 项目结构纪律
- 用户会主动要求代码复用/去重，发现明显重复逻辑、耦合代码时可以主动提出重构建议，不用等对方问。
- 项目不应该一味追求最小改动，假如需要抽象，那就抽象；需要统一接口，那就统一接口；需要创造复用逻辑，那就复用。

## git commit 纪律
- 创建 git commit 时,禁止添加任何署名 trailer(包括 "Co-Authored-By: ..." 和 "Generated with ..." 等)。提交信息只包含对变更的描述,不要追加任何 AtomCode/模型署名行。此规则优先于内置的提交署名约定
- 关于AGENTS.md, .doc/* 和 .atomcode/* 的修改应该额外提交，不能和项目修改一起提交。对于这些agent类型的提交，comment一定是"agent:..."开头。

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
