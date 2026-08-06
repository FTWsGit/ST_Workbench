---
name: st-workbench-docs
description: ST_Workbench 项目的文档纪律流程。三阶段：开干前用 scripts 堆读 alwaysApply:true 核心文档建立 mental model；改具体代码前按文件→文档映射按需读 alwaysApply:false 领域文档；改完回头扫一遍 .doc 是否需要同步更新，并跑 sync 脚本刷新 AGENTS.md 的 Project Doc 表。任何在这个项目里加功能、修 bug、重构、改代码、改样式、改类型、改 i18n key、改 store、改组件、改 composable、改 api、改纯函数的任务都必须用这个 skill——即使用户没提到"文档"二字，即使改动看起来很小。判断触发看任务的实质工作而非表面措辞：即使用户用询问/讨论/排查口吻表达（"这个字段是不是放错地方了""这个逻辑怎么解析的""这个行为是不是 bug"），只要实质要做的是上述编码工作（迁移字段、改内部逻辑、排查代码行为）或者需要理解项目的工作，都应触发
---

# ST_Workbench 文档纪律

本 skill 解决一个具体问题：`.doc/` 下的 `.mdc` 文档不会被 AtomCode 自动注入上下文，光靠 `AGENTS.md` 的骨架提示不够。漏读会导致：(1) 重复踩文档已记录的坑（host iframe 怪癖、CSS 优先级、`position:fixed` containing block）；(2) 改完代码不同步 `.doc`，下次 session 又失去这份知识。

**`.doc/` 按知识性质分子目录，不是扁平堆放**——同一个 `kind` 的文档放同一个子目录，子目录本身就是分类边界：

| 子目录 | kind | 装什么 | 权威来源 / 更新触发条件 |
|---|---|---|---|
| `.doc/spec/` | `spec` | SillyTavern 自己的数据结构/API 契约（preset/character/worldbook） | ST 上游协议变了才该动；本项目重构不该触发这类文档的改动——如果发现自己在因为"重构"而改 `spec/` 下的文档，先怀疑是不是内容从一开始就放错了目录 |
| `.doc/architecture/` | `architecture` | 本项目自己的结构性设计决策（store 边界、路由机制、新增功能套路表） | 本项目重构 |
| `.doc/subsystems/` | `subsystem` | 相对独立的技术子系统机制（i18n、移动端布局、编辑器内核、性能、部署环境） | 对应子系统的代码变了 |
| `.doc/features/` | `feature` | 面向具体用户功能的机制说明（一个 feature 一个 `.mdc`，不同功能不共用一篇，哪怕标题看着像同一类） | 对应功能的实现变了 |
| `.doc/meta/` | `meta` | 关于项目状态本身的清单（TODO/限制/过渡状态） | 状态变化时 |
| `.doc/`（根） | `overview` | 项目概览，唯一的入口级文档，不装具体领域知识 | 目录结构/顶层定位变了 |

新建文档先问自己"这是哪个 kind"，放对子目录、front matter 补 `kind` 字段（`docs:create` 的 `--kind` 参数），不要图省事丢进 `.doc/` 根目录——根目录只留 `项目概览.mdc` 一篇。**一篇文档只讲一个 kind 的一件事**——两个概念只是标题关键词撞车（比如都带"预览"二字）不代表该合并，判断标准是"权威来源/更新触发条件是否相同"，不是字面相似。

**文档清单是 front matter 的真相源**——不要在本 skill 里硬编码"哪几个文件是 alwaysApply:true"或"哪个文件在哪个子目录"，文档会增删改、也会挪目录。封装 script 从 `.doc/**/*.mdc`（递归子目录）的 YAML front matter 直接读：

| Script | 干什么 | 用法 |
|---|---|---|
| `docs:list` | 枚举 `.doc` 全部 front matter（递归子目录），输出 JSON（`file` / `name` / `kind` / `description` / `alwaysApply`） | `npm run docs:list -- [--dir <path>]` |
| `docs:get_always` | 堆读 `alwaysApply:true` 文档完整内容，stdout 纯文本 | `npm run docs:get_always -- [--dir <path>]` |
| `docs:sync_agent` | 按当前 front matter 生成 Project Doc 表，替换 AGENTS.md 对应段落 | `npm run docs:sync_agent -- [--dir <path>] [--agents <agent_file>]` |
| `docs:create` | 创建新的 .mdc 文档，自动添加规范front matter（<name>不加后缀） | `npm run docs:create -- <name> "<description>" --kind <kind> [--always] [--dir <path>] [--force]` |

其中，--dir默认".doc"（`docs:create`建议传对应 kind 的子目录，如`--dir .doc/subsystems`，而不是让新文档落进`.doc`根目录）; --kind是`docs:create`专属，写`spec`/`architecture`/`subsystem`/`feature`/`meta`之一（不给会warn但不会拦，front matter里`kind`字段留空）; --agents是需要同步的agent文件，默认"AGENTS.md"; --always将alwaysApply调整为true，不填默认false; --force是强制覆盖同名文件，慎用。

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
| `src/components/preset/PreviewPanel.vue`、macroAwareDiff/wordDiff | 跟精确预览相关的 `.mdc` |
| `src/regexEngine.ts`、正则测试栏预览 | 跟正则本地模拟相关的 `.mdc` |
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
- **新内容先定 kind 再定放哪篇**：一段新知识要落进 `.doc`，先问"这是 spec/architecture/subsystem/feature/meta 里的哪一个"，kind 不同就不能塞进同一篇——哪怕两者标题关键词看着像（例子：ST 渲染管线的精确预览 vs 正则本地模拟，都带"预览"字样但权威来源、更新触发条件完全不同，必须分开成 `features/` 下两篇）
- **文档体量变大是拆分信号，不是"内容详实"的褒奖**：一篇 `.mdc` 里如果出现"叙述性设计说明"和"纯查表型速查内容"两种阅读节奏（前者要通读理解为什么，后者是 Ctrl+F 查一行答案），拆成两篇，各自 `description` 只覆盖自己那部分场景

## 不做的事

- 不硬编码 `.doc` 文件清单——清单靠 front matter 的真相源，跑 `npm run docs:list` 拿。
