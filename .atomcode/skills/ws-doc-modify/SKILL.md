---
name: ws-doc-modify
description: ST_Workbench 项目的 .doc 文档同步纪律。本轮任务真的发生了代码改动，`npm run typecheck` 和 `npm run build` 通过之后，需要修改文档/.doc的时候使用。
---

# 文档同步纪律

## `.doc/` 怎么组织

| 子目录 | kind | 回答什么问题 | 装什么 |
|---|---|---|---|
| `.doc/`（根） | `overview` | 项目是什么 | 项目概览，唯一入口级文档 |
| `.doc/explanation/architecture/` | `architecture` | 整体结构是什么 | 本项目自己的结构性设计现状 |
| `.doc/explanation/subsystems/` | `subsystem` | 每个子系统/模块的机制 | 相对独立的技术子系统机制 |
| `.doc/guides/` | `guide` | How do I…? | 任务导向的查表型文档，一行任务对一行答案 |
| `.doc/guides/contract` | `contract` | 子系统之间、项目内部的契约和规则 | 各个subsystem的types.ts之外的调用规范，使用契约 |
| `.doc/reference/spec/` | `spec` | 外部知识和契约 | SillyTavern 自己的数据结构/API 契约，ST 上游协议变了才该动 |
| `.doc/decisions/` | `decision` | 为什么做某个决策 | 标准ADR。单个设计决策的背景/决策/后果，追加式、编号、accepted 后不改正文 |

## 脚本

| Script | 干什么 | 用法 |
|---|---|---|
| `docs:list` | 枚举 `.doc` 全部 front matter，输出 JSON | `npm run docs:list -- [--dir <path>]` |
| `docs:create` | 创建新的 .mdc 文档，自动添加规范 front matter（`<name>` 不加后缀） | `npm run docs:create -- <name> "<description>" --kind <kind> [--always] [--dir <path>] [--force]` |

其中，--dir 默认 ".doc"（`docs:create` 建议传对应 kind 的子目录，如 `--dir .doc/explanation/subsystems`，而不是让新文档落进 `.doc` 根目录）; --kind 是 `docs:create` 专属，写 `spec`/`architecture`/`subsystem`/`decision`/`contract` 之一（不给会 warn 但不会拦，front matter 里 `kind` 字段留空）; --always 将 alwaysApply 调整为 true，不填默认 false; --force 是强制覆盖同名文件，慎用。**`decision` 的两条约定脚本不会帮你校验**——文件名前缀四位序号（`0008-slug`）、`alwaysApply` 恒为 false，都要自己传对，传错脚本照样生成不会报错。本项目内部接口形状（类型/签名）不单独写文档——TypeScript 源码本身就是契约，直接读 `.ts`；行为约定/gotcha 进 `guides/`。


## 触发条件

| 风险等级 | 代码变更类型 | 示例 | 文档同步要求 |
|---|---|---|---|
| L0-机械重构 | 纯重命名、移动文件、提取函数但行为不变、改 import 路径 | `extractFn`、`move file A→B`、变量重命名 | 如果 .mdc 里提到了旧文件名/旧函数名，description 或正文需要同步；|
| L1-subsystem内部接口变更 | 改函数签名、改 props 类型、改 store 导出字段、改 API 响应形状 | uiStore 新增 `toolsPanelOpen`、改 `VarOp` 接口 | **必须检查引用该接口的 .mdc**：guides 里提到字段名/行为约定的、explanation 里提到数据流的；TS 类型/签名本身不进 .mdc，但行为约定要 |
| L2-行为变更 | 改内部算法、改状态机流转、改 dirty 追踪逻辑、改渲染机制 | offsetHeight→getBoundingClientRect、shadow tree 双轨 rebuild、watcher 逻辑 | **必须检查机制文档**：explanation/subsystems、explanation/architecture 中描述该机制的正文；如果行为变了但文档说"会这样"，文档就是错的 |
| L3-架构迁移 | 拆组件、迁状态机、新增/删除 domain、改路由机制 | VarNav 从 presetStore→uiStore、新增 domain | **必须新增/删除/搬迁 .mdc + 更新 decision 记录**：explanation/architecture 要改、decision 要新开、guides/新增功能套路表要补 |
| L4-subsystem外部接口变更/新增 | 修改export的函数签名、增加了新的i18n领域、新增更多CSS样式、更改了纪律/契约 | main.css增加了`.wb-btn`、i18n增加了`char-*`key、agent的tool 接口发生了改变 | 修改对应的guides/contract，修改契约和规则 |

**判定入口**：问自己"这次变更落在 L 几？"——不是"有没有改代码"，而是"改了什么性质的代码"。


## 同步检查清单（按等级递进）

### 所有等级都必须做
1. **跑 `npm run docs:list`**，拿到当前 front matter 真相源。

### L1+ 必须做：接口引用检查
遍历 `npm run docs:list` 输出，检查是否有 `.mdc` 的正文或 description 提到了：
- 被修改的**函数名/字段名/类型名**
- 被修改的**文件路径**
- 被修改的**props 名或事件名**

检查方法：用 `grep -n` 或等效搜索在 `.doc/**/*.mdc` 中搜变更涉及的标识符。命中了就必须读对应 `.mdc` 判断是否需要同步。

### L2+ 必须做：机制事实检查
对 Phase 1/Phase 2 读过的 `.mdc`，检查正文中描述的**具体事实**是否仍然成立：
- "文件名是 X" → 文件还在吗？改名了吗？
- "字段 Y 做 Z" → 字段还在吗？逻辑变了吗？
- "状态机走 A→B" → 流转路径变了吗？
- "还没做/已经做了" → 状态变了吗？

**判定算法**：对每条事实，问自己"如果下次 session 不知道这次改动，会基于这条文档做出错误判断吗？"——会，就改；不会，跳过。

### L3+ 必须做：架构一致性检查
- **新增代码匹配现有套路吗？** → 查「新增功能套路表」，需要补新条目吗？
- **新增/删除的子系统或功能有对应 .mdc 吗？** → 没有就新建，有就更新。
- **状态机迁移了吗？** → 旧文档里的宿主描述要改，新宿主文档要补。
- **开了新决策吗？** → 进 `decisions/`，四位序号前缀，`alwaysApply: false`，`status: accepted`。
- **推翻了旧决策吗？** → decisions旧文件 `status: superseded`，新文件 `supersedes` 指回旧文件。**不回头改旧决策正文**。

### L4 必须做：契约更新

L4 变更动的是项目对外承诺的"规矩"——export 签名、i18n 域、CSS class、纪律/契约本身。承载这些规矩的是 `.doc/guides/contract/*.mdc`，代码改完必须同步对应契约，否则下次 session 按旧契约写代码就是错的：

- **改了 export 函数签名 / 新增导出** → grep 旧签名/旧函数名在 `.doc/**/*.mdc` 的引用；guides/contract 里写了用法或行为约定的必须同步
- **新增 i18n 领域或 key** → 对照「i18n-key命名规范」的域划分：新 key 落进已有域则不动契约；引出了新域（如 `char-*`）必须在该契约补域定义
- **新增/改动 CSS class** → 对照「ui样式与组件字典」：先自查前缀约定（`pr`/`rx`/`wb`），字典按前缀分块，新 class 必须补条目
- **改了纪律/契约本身** → 直接改对应 contract 文档，契约是这类规则的单源；改完 grep 其他 `.mdc` 是否复述了旧规则，复述的也要同步

**判定入口**：问自己"这次变更有没有对应的契约文档？"——有，就是 L4，代码改完必须同步那份契约

## 新增文档的纪律

新建 `.mdc` 前必须先回答：

1. **这是哪个 kind？** `contract`/`architecture`/`subsystem`/`decision`
2. **权威来源是谁？** ST 上游 / 本项目代码 / 设计讨论
3. **更新触发条件是什么？** "对应代码变了就改" vs "决策被推翻才改"
4. **alwaysApply 是 true 还是 false？** true = 每个 session 的默认上下文；false = 靠 description 按需匹配
5. **description 怎么写？** 只写"这个文档是什么、何时读"，不写"为什么"——"为什么"进正文或 decision

## 改 `.doc` 的硬规则

- `.doc/*` 只写"项目是什么"，不写用户要求、不写对 AI 的喊话、不写踩坑史
- `description` 只写"文档里面有什么、何时读"，不写法理论
- `.mdc` 之间不能互相直接引用文件名（如 `...见国际化.mdc`），必要时只用自然语言描述领域
- **文档体量变大是拆分信号**：出现两种阅读节奏（通读理解 vs Ctrl+F 查一行）就拆

## 不做的事

- 不硬编码 `.doc` 文件清单——清单靠 front matter 真相源，跑 `docs:list` 拿
- 不改ADR：文档里的"为什么这样设计"（decision 类内容）不因代码重构而重写
- 不替代码写注释：`.doc` 是跨 session 的持久知识，不是代码注释的搬运工
- 不照搬types.ts：假如能够写到types.ts里面的interface形状，就不要写到`.doc`里面
- contract不写SillyTavern接口/subsystem内部描述：contract写的是subsystem/各个模块之间的契约/规则/使用方法
