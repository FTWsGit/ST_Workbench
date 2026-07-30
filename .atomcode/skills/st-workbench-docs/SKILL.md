---
name: st-workbench-docs
description: ST_Workbench 项目的文档纪律流程。三阶段：开干前用 scripts 堆读 alwaysApply:true 核心文档建立 mental model；改具体代码前按文件→文档映射按需读 alwaysApply:false 领域文档；改完回头扫一遍 .doc 是否需要同步更新，并跑 sync 脚本刷新 AGENTS.md 的 Project Doc 表。任何在这个项目里加功能、修 bug、重构、改代码、改样式、改类型、改 i18n key、改 store、改组件、改 composable、改 api、改纯函数的任务都必须用这个 skill——即使用户没提到"文档"二字，即使改动看起来很小。判断触发看任务的实质工作而非表面措辞：即使用户用询问/讨论/排查口吻表达（"这个字段是不是放错地方了""这个逻辑怎么解析的""这个行为是不是 bug"），只要实质要做的是上述编码工作（迁移字段、改内部逻辑、排查代码行为），都应触发。本 skill 不用于非 ST_Workbench 项目，也不用于单纯阅读文档/解释概念/查 markdown 语法的非编码任务。
---

# ST_Workbench 文档纪律

本 skill 解决一个具体问题：`.doc/` 下的 `.mdc` 文档不会被 AtomCode 自动注入上下文，光靠 `AGENTS.md` 的骨架提示不够。漏读会导致：(1) 重复踩文档已记录的坑（host iframe 怪癖、CSS 优先级、`position:fixed` containing block）；(2) 改完代码不同步 `.doc`，下次 session 又失去这份知识。

**文档清单是 front matter 的真相源**——不要在本 skill 里硬编码"哪几个文件是 alwaysApply:true"，文档会增删改。三个封装 script 从 `.doc/*.mdc` 的 YAML front matter 直接读：

| Script | 干什么 | 用法 |
|---|---|---|
| `scripts/list_docs.mjs` | 枚举 `.doc` 全部 front matter，输出 JSON（`file`/`name`/`description`/`alwaysApply`） | `node .atomcode/skills/st-workbench-docs/scripts/list_docs.mjs` |
| `scripts/print_always.mjs` | 堆读 `alwaysApply:true` 文档完整内容，stdout 纯文本 | `node .atomcode/skills/st-workbench-docs/scripts/print_always.mjs` |
| `scripts/sync_project_doc.mjs` | 按当前 front matter 生成 Project Doc 表，替换 AGENTS.md 那一段 | `node .atomcode/skills/st-workbench-docs/scripts/sync_project_doc.mjs` |

三个 script 都认 `--dir <path>`（默认 `.doc`）；`sync_project_doc.mjs` 还认 `--agents <path>`（默认 `AGENTS.md`）。

## Phase 1 — 开干前堆读核心文档

**任何 ST_Workbench 编码任务，在写第一行代码 / 第一个 edit_file 之前**，跑一次 print_always 把所有 `alwaysApply:true` 文档全量读进上下文：

```bash
node .atomcode/skills/st-workbench-docs/scripts/print_always.mjs
```

一次拿到 stdout 里所有核心文档的完整内容，省去多次 `read_file`。理由：这些是 mental model——目录结构、六个 Pinia store 的职责边界、多 domain 路由（`domain` vs `workspace` 两个正交轴）、MetaPanel、host iframe 怪癖（`getHostWindow()`/`getHostDocument()` 铁律）、移动端断点状态机。漏任何一个都会导致改错地方、复用错模式、踩已知坑。

**判已完成的口子**：本 session 已经跑过一次 print_always 且后续没换任务——不用重跑。换任务、新 session、记忆里没有这些文件的具体内容时，重跑。

## Phase 2 — 改具体代码前按映射读领域文档

根据**要改的文件路径**匹配读对应 `alwaysApply:false` 文档。改之前读，不是改之后读。**不硬编码文件名清单**——拿映射对的清单靠 `node scripts/list_docs.mjs` 跑一遍看当前有哪些 `alwaysApply:false` 文件 + 它们的 `description`（"何时读"由每个 `.mdc` 的 front matter `description` 字段决定，本 skill 不重述）。

**判定 Phase 2 要读哪几个**：跑 `list_docs.mjs`，遍历输出里 `alwaysApply: false` 的条目，问自己"要改的文件 / 区域符不符合这个条目 description 写的场景"——符合就读对应 `.mdc`。举几个高频映射作样：

| 要改的文件 / 区域 | 对应领域文档（跑 list_docs 确认当前还存在） |
|---|---|
| `src/stores/*.ts` 内部字段、`src/api/*.ts`、dirty 追踪、settings 持久化 | 跟 store / API / 持久化相关的 `.mdc` |
| `src/components/shared/HighlightedEditor.vue`、`src/composables/useHighlight.ts`、行号测量、打字调度 | 跟编辑器内核相关的 `.mdc` |
| `src/components/preset/PreviewPanel.vue`、`src/regexEngine.ts`、正则预览 | 跟预览/正则模拟相关的 `.mdc` |
| 加 locale key、加新语言、排查漏翻译 | 跟 i18n 相关的 `.mdc` |
| 被反馈"卡/掉帧/行号错位/打字延迟" | 跟性能相关的 `.mdc` |
| 判断某功能是否已实现、是否刻意留口子、排查已知行为 | 跟 TODO 状态相关的 `.mdc` |

**没匹配到**：要改的区域不在任何 `alwaysApply:false` 文档的 description 场景里（比如改 `App.vue` 顶栏按钮、改 `confirmStore`），Phase 2 不读额外文档——Phase 1 的核心文档已经覆盖了这些通用 UI 布局知识。

**多文件多映射**：一次任务要改多个不同区域的文件时，把每个区域映射到的文档都读一遍。比如同时改 `presetStore.ts` 和 `useHighlight.ts`，就都读对应 `.mdc`。

**遇到不确定的边界**：改动横跨多个领域（比如改 `HighlightedEditor` 的行号测量同时影响性能），优先两个都读，不要赌"够用"。

## Phase 3 — 改完回头检查 .doc 是否需要同步

代码改完、`npm run typecheck` 通过后，**回头扫一遍 Phase 1 + Phase 2 读过的所有 `.mdc` 文件**，检查有没有以下几类需要同步更新的内容：

1. **目录树过期**（`项目概览.mdc` 类的核心文档里的项目结构块）：加了新文件 / 删了文件 / 改了文件职责，目录树里那行的注释要不要跟着改。
2. **store 职责边界描述过期**（架构总览类的文档里讲 store 职责的段）：把某个字段从一个 store 挪到另一个、给 store 加了新导出、改了内部数据结构，对应描述要不要改。
3. **套路表过期**（架构总览类的文档里"新增功能套路"表）：如果是结构性改动（加了新 domain、新面板类型、新悬浮窗），套路表要不要补一行。
4. **`description` front matter 过期**：如果改动让某个 `.mdc` 的"何时读"描述不再准确（比如某功能从 TODO 变成已实现，TODO 状态文档要删它；或者某领域文档的触发场景变了），改 front matter 的 `description`。
5. **TODO 状态变化**（TODO 状态类的文档）：把某 TODO 项实现了 / 把"有意为之的限制"真正解除了 / 加了新的已知限制，对应条目要加/改/删。

**判定要不要改的口子**：问自己"下次新 session 不知道这次的改动，会读错或踩坑吗"——答案是会，就改 `.doc`；不会，就跳过。

**改了 `.doc`（增删文件、改 front matter、改 description）之后**，跑一次 sync 脚本刷新 AGENTS.md 的 Project Doc 表：

```bash
node .atomcode/skills/st-workbench-docs/scripts/sync_project_doc.mjs
```

它会按当前 front matter 重新生成那张表，替换 AGENTS.md 里 `## Project Doc` 段的表本身（保留表前的引言段，那段是给 AI 的行为约束不是数据）。不碰 AGENTS.md 的其它段。

**改 `.doc` 的纪律**（来自 `AGENTS.md` 的"注释/文档纪律"段，本 skill 不重述，但提醒一句）：`.doc` 只写"当前 AI 需要的行为约束"，不写展望、不写对 AI 的喊话、不写踩坑史；`description` 只写"何时读"，不写法理论。

## 不做的事

- 不重述 `.mdc` 文件的内容——本 skill 只管"何时读哪个文件"，文件内容靠 script / `read_file` 拿。
- 不替代 `AGENTS.md`——`AGENTS.md` 的"Dev Notes / 注释纪律 / Commands / Architecture / Critical Host-Environment Quirk / Data Flow Rules / Styling / Drag & Mobile Interaction / Key Gotchas"段是行为约束，本 skill 只管 `.doc` 文档的读取时机和同步。
- 不读非 `.doc` 的文档（`AGENTS.md`、`CLAUDE.md`、`.atomcode.md` 这些由系统自动注入或别的机制管）。
- 不做代码 review——改完用 `npm run typecheck` 验证是 AGENTS.md 的 Commands 段规定，不是本 skill 的职责。
- 不硬编码 `.doc` 文件清单——清单靠 front matter 的真相源，跑 `list_docs.mjs` 拿。
