# ST_Workbench — Agent Guide

## 大面积修改/增加测试/重构 workflow
最佳实践：
1. 传奇调查员：派出并行subagents(Worker)进行调查，在.temp/invest-*.md写出调查报告，每个subagent对应一篇，以供subagents进行修改时查阅. 因为需要写报告，所以必须是Worker
2. 任务batch撰写：根据任务，在.temp/task-*.md写出任务上下文 & 任务目标，每篇对应一个subagent，避免将全部任务上下文和巨量细节直接写到tasks数组里面
3. 赏金猎人：派出并行subagents(Worker)进行任务，提供基本上下文和目标，告知它对应的调查报告和任务报告，由它自己读取

## 注释/文档纪律

- 注释/文档只写**做了什么、为什么**。不写"怎么摸索到的、历史上踩过什么坑、为什么没用另一方案"。对比可行 vs 不可行、踩坑史、淘汰方案是 git log / issue tracker 的事，不进注释
- 注释中绝不提及或引用任何外部文档，不能用诸如`详情见xxx.mdc`、`具体看xxx领域的文档`
- 一句话能写的规矩**不用扩成一段论证**。论证口头给用户讲，不写进文件；AI 读到对应代码/类型自会懂为什么，不用注释先讲一遍
- 不给已有代码补解释性注释

- 文档 只写"项目是什么"，不写用户的要求、展望，不写讨论过程，不写其他方案，不写其他文档的内容
- `description`骨架提示只写**是什么、何时读**。不写写法理论、不写"不是什么"。

## 项目结构纪律
- 项目不应该一味追求最小改动，假如需要抽象，那就抽象；需要统一接口，那就统一接口；需要创造复用逻辑，那就复用

## 项目测试纪律
- 凡是能用独立脚本先验证正确性/复现 bug 再合并的改动，都应该这么做（纯函数如 `utils.ts` / `regexEngine.ts` / `useHighlight.ts` 用 `npx tsx <file>` 跑）。
- 改完代码使用 `npm run lint` 来检查是否有风格错误，
- 最后一定使用 `npm run typecheck`、`npm run build` 和 `npm run test` 来验证代码
- 收尾的时候永远使用 `npm run format` 来整理代码format


## git 纪律
- 创建 git commit 时,禁止添加任何署名 trailer(包括 "Co-Authored-By: ..." 和 "Generated with ..." 等)。提交信息只包含对变更的描述,不要追加任何 AtomCode/模型署名行。此规则优先于内置的提交署名约定
- 关于AGENTS.md, .doc/* 和 .atomcode/* 的修改应该额外提交，不能和项目修改一起提交。对于这些agent类型的提交，comment一定是"agent:..."开头
- 永远使用英文comment

- 使用 `git checkout` `git reset` 之前，至少要看 `git status`，有其他人的改动应该先 `git stash push -m ...`

## Commands

| Command | Action |
|---|---|
| `npm run build` | Vite ESM build → `dist/index.js` + `dist/style.css` |
| `npm run typecheck` | `vue-tsc --noEmit` |
| `npm run format` | `prettier --write src` |
| `npm run lint` | `eslint src && stylelint src/**/*.css` |
| `npm run lint-fix` | `eslint src --fix && stylelint src/**/*.css --fix` |
| `npm run test` | `vitest run` |


Build is a library `es` format (`vite.config.js`, `cssFileName: 'style'`). No dev server. CSS is emitted as `dist/style.css` and injected by ST via the `manifest.json` `css` field, not by vite plugins.

## Critical Host-Environment Quirk

The project runs as a standard ST extension (`manifest.json` + `hooks`) directly in the ST main document — no iframe. Bare `window`/`document` refer to the host page. The `hostEnv.ts` `getHostWindow()`/`getHostDocument()` interfaces are kept (they degrade to bare `window`/`document` under standard deployment, see decision 0010), but new code can use bare references directly.
- **No native `window.confirm`/`prompt`/`alert`**: They're unreliable in Tauri/WebView2. Use `confirmStore.ask()` / `confirmStore.askInput()`.
- **No native HTML5 drag-and-drop**: It breaks in Tauri/WebView2. All lists use `useDragReorder.ts` (Pointer Events). Touch drag requires a `.wb-drag-handle` with `touch-action: none`.
- `copyToHostClipboard()` (with execCommand fallback) and `useIsMobile()` (matchMedia-based) are still real utilities — keep using them.

## Data Flow Rules

- **Deep clone before passing to ST APIs**: `JSON.parse(JSON.stringify(data))` (in `api/apiUtils.ts`). Never pass Pinia/Vue reactive proxies — they crash `structuredClone` and can leak into ST's internal state.
- **Settings persistence**: Add new options by editing `Settings` interface + `DEFAULT_SETTINGS` in `src/types.ts` only. `uiStore.saveSettings()` handles localStorage.
- **i18n**: `zh-CN` is the reference locale. Add keys in `zh-CN.ts` first, then in `en.ts`. Call via `uiStore.t(key, params?)`. LocaleKey type catches typos at `npm run typecheck`.
