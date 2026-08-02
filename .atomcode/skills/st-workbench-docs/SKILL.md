---
name: st-workbench-docs
description: ST_Workbench 项目的文档纪律流程。三阶段：开干前用 scripts 堆读 alwaysApply:true 核心文档建立 mental model；改具体代码前按文件→文档映射按需读 alwaysApply:false 领域文档；改完回头扫一遍 .doc 是否需要同步更新，并跑 sync 脚本刷新 AGENTS.md 的 Project Doc 表。任何在这个项目里加功能、修 bug、重构、改代码、改样式、改类型、改 i18n key、改 store、改组件、改 composable、改 api、改纯函数的任务都必须用这个 skill——即使用户没提到"文档"二字，即使改动看起来很小。判断触发看任务的实质工作而非表面措辞：即使用户用询问/讨论/排查口吻表达（"这个字段是不是放错地方了""这个逻辑怎么解析的""这个行为是不是 bug"），只要实质要做的是上述编码工作（迁移字段、改内部逻辑、排查代码行为），都应触发。本 skill 不用于非 ST_Workbench 项目，也不用于单纯阅读文档/解释概念/查 markdown 语法的非编码任务。
---

# ST_Workbench 文档纪律

本 skill 解决一个具体问题：`.doc/` 下的 `.mdc` 文档不会被 AtomCode 自动注入上下文，光靠 `AGENTS.md` 的骨架提示不够。漏读会导致：(1) 重复踩文档已记录的坑（host iframe 怪癖、CSS 优先级、`position:fixed` containing block）；(2) 改完代码不同步 `.doc`，下次 session 又失去这份知识。

**文档清单是 front matter 的真相源**——不要在本 skill 里硬编码"哪几个文件是 alwaysApply:true"，文档会增删改。封装 script 从 `.doc/*.mdc` 的 YAML front matter 直接读：

| Script | 干什么 | 用法 |
|---|---|---|
| `docs:list` | 枚举 `.doc` 全部 front matter，输出 JSON（`file` / `name` / `description` / `alwaysApply`） | `npm run docs:list -- [--dir <path>]` |
| `docs:get_always` | 堆读 `alwaysApply:true` 文档完整内容，stdout 纯文本 | `npm run docs:get_always -- [--dir <path>]` |
| `docs:sync_agent` | 按当前 front matter 生成 Project Doc 表，替换 AGENTS.md 对应段落 | `npm run docs:sync_agent -- [--dir <path>] [--agents <agent_file>]` |
| `docs:create` | 创建新的 .mdc 文档，自动添加规范front matter（<name>不加后缀） | `npm run docs:create -- <name> "<description>" [--always] [--dir <path>] [--force]` |

其中，--dir默认".doc"; --agents是需要同步的agent文件，默认"AGENTS.md"; --always将alwaysApply调整为true，不填默认false; --force是强制覆盖同名文件，慎用。

## Phase 1 — 开干前读核心文档

**任何 ST_Workbench 编码任务，在写第一行代码 / 第一个 edit_file 之前**，跑一次 print_always 把所有 `alwaysApply:true` 文档全量读进上下文：

```bash
npm run docs:get_always
```

一次拿到 stdout 里所有核心文档的完整内容，省去多次 `read_file`。

**判已完成的口子**：本 session 已经跑过一次 print_always 且后续没换任务——不用重跑。换任务、新 session、记忆里没有这些文件的具体内容时，重跑。

## Phase 2 — 改具体代码前按映射读领域文档

根据**要改的文件路径**匹配读对应 `alwaysApply:false` 文档。改之前读，不是改之后读。**不硬编码文件名清单**——拿映射对的清单靠 `npm run docs:list` 跑一遍看当前有哪些 `alwaysApply:false` 文件 + 它们的 `description`（"何时读"由每个 `.mdc` 的 front matter `description` 字段决定，本 skill 不重述）。

**判定 Phase 2 要读哪几个**：跑 `docs:list`

```bash
npm run docs:list
```

遍历输出里 `alwaysApply: false` 的条目，问自己"要改的文件 / 区域符不符合这个条目 description 写的场景"——符合就读对应 `.mdc`。举几个高频映射作样：

| 要改的文件 / 区域 | 对应领域文档（跑 list_docs 确认当前还存在） |
|---|---|
| `src/stores/*.ts` 内部字段、`src/api/*.ts`、dirty 追踪、settings 持久化 | 跟 store / API / 持久化相关的 `.mdc` |
| `src/components/shared/HighlightedEditor.vue`、`src/composables/useHighlight.ts`、行号测量、打字调度 | 跟编辑器内核相关的 `.mdc` |
| `src/components/preset/PreviewPanel.vue`、`src/regexEngine.ts`、正则预览 | 跟预览/正则模拟相关的 `.mdc` |
| 加 locale key、加新语言、排查漏翻译 | 跟 i18n 相关的 `.mdc` |
| 被反馈"卡/掉帧/行号错位/打字延迟" | 跟性能相关的 `.mdc` |
| 判断某功能是否已实现、是否刻意留口子、排查已知行为 | 跟 TODO 状态相关的 `.mdc` |

**没匹配到**：要改的区域不在任何 `alwaysApply:false` 文档的 description 场景里，Phase 2 不读额外文档——Phase 1 的核心文档已经覆盖了这些通用 UI 布局知识。假如核心文档没有覆盖，那么要么`.doc`过期，要么`description`过期，

**多文件多映射**：一次任务要改多个不同区域的文件时，把每个区域映射到的文档都读一遍。

**遇到不确定的边界**：改动横跨多个领域，优先两个都读，不要赌"够用"。

## Phase 3 — 改完回头检查 .doc 是否需要同步

代码改完、`npm run typecheck` 和 `npm run build` 通过后，检查是否需要同步对应的.mdc文档:

```bash
npm run docs:list
```

同步检查有没有以下几类需要更新的内容：

1. **front matter 过期**: 假如.mdc文件名字更改，`name`也应该相应改变。如果改动让某个 `.mdc` 的"何时读"描述不再准确，或者你工作过程中发现有`description`对你产生了误导，改 front matter 的 `description`。
2. **正文内容过期**: Phase 1/Phase 2 读过的 .mdc，如果正文里写的具体事实（提到的文件名、字段名、函数名、某个状态"还没做/已经做了"这类描述）因为这次改动不再成立，改正文

**判定要不要改的口子**：问自己"下次新 session 不知道这次的改动，会读错或踩坑吗"——答案是会，就改 `.doc`；不会，就跳过。

**改了 `.doc`（增删文件、改 front matter、改 description）之后**，跑一次 sync 脚本刷新 AGENTS.md 的 Project Doc 表：

```bash
npm run docs:sync_agent
```

它会按当前 front matter 重新生成那张表，替换 AGENTS.md 里 `## Project Doc` 段的表本身。

**改 `.doc` 的纪律**：
- `.doc/*` 只写"项目是什么"，不写用户的要求、展望、不写对 AI 的喊话、不写踩坑史
- `description` 只写"是什么、何时读"，不写法理论
- 每个`.mdc`之间不能互相直接引用，如`...见国际化.mdc`。假如有必要引用其他领域的文档，只用自然语言描述那个领域，比如: `...详情见i18n相关的文档`

## 不做的事

- 不硬编码 `.doc` 文件清单——清单靠 front matter 的真相源，跑 `npm run docs:list` 拿。
