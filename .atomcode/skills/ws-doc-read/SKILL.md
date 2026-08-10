---
name: ws-doc-read
description: ST_Workbench 项目的读码前置纪律。任何需要理解这个项目才能回答的任务——加功能、修 bug、重构、改代码，也包括纯解释/讨论/排查口吻的提问（"这个字段是不是放错地方了""这个逻辑怎么解析的""XX 是怎么实现的""修一下这个 bug"）——动手读代码/写代码之前用。
---

# 读码前置纪律

## 为什么存在

`.doc/` 下的 `.mdc` 文档不会被当前 cli agent 自动读取注入上下文。本 skill 借用"cli agent 会读 skill"这个特性模拟 Cursor 自动读 `.mdc` 的效果。

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
| `docs:list` | 枚举 `.doc` 全部 front matter，输出 JSON（`file` / `name` / `kind` / `description` / `alwaysApply`） | `npm run docs:list -- [--dir <path>]` |
| `docs:get_always` | 堆读 `alwaysApply:true` 文档完整内容，stdout 纯文本 | `npm run docs:get_always -- [--dir <path>]` |

其中，--dir 默认 ".doc"。

## Phase 1 — 开干前读核心文档

**任何需要理解 ST_Workbench 才能回答的任务**——不管最终会不会落地成一次代码改动，纯解释"这是怎么实现的"、纯排查"这是不是 bug"也算——在读第一行源码 / 写第一行代码 / 第一个 edit 之前，跑一次 print_always 把所有 `alwaysApply:true` 文档全量读进上下文：

```bash
npm run docs:get_always
```

## Phase 2 — 碰具体代码区域前按映射读领域文档

根据**要碰的文件路径/技术区域**匹配读对应 `alwaysApply:false` 文档——"碰"包括要改它、要读它答疑、要排查它的行为，不是只有"要改"才算。读之前读，不是读完源码/改完代码再补。拿映射对的清单靠 `npm run docs:list` 跑一遍看当前有哪些 `alwaysApply:false` 文件 + 它们的 `description`（"何时读"由每个 `.mdc` 的 front matter `description` 字段决定）。

**判定 Phase 2 要读哪几个**：跑 `docs:list`

```bash
npm run docs:list
```

遍历输出里 `alwaysApply: false` 的条目，问自己"要碰的文件 / 区域符不符合这个条目 description 写的场景"——符合就读对应 `.mdc`。举几个高频映射作样（具体文件名以 `docs:list` 当前输出为准，这里只举场景）：

**没匹配到**：要碰的区域不在任何 `alwaysApply:false` 文档的 description 场景里，Phase 2 不读额外文档——Phase 1 的核心文档已经覆盖了这些通用知识。

**多文件多映射**：一次任务要碰多个不同区域的文件时，把每个区域映射到的文档都读一遍。

**遇到不确定的边界**：改动横跨多个领域，优先两个都读，不要赌"够用"。

## 代码改完之后

如果本轮任务真的发生了代码改动（不只是纯答疑/纯排查），`npm run typecheck` 和 `npm run build` 通过之后，还有一步文档同步检查——那套纪律在 `ws-doc-modify` skill 里。
