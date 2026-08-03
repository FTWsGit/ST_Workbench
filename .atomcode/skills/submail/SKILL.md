---
name: submail
description: 当你准备用 tasks 工具并行派发多个 worker subagent，且这些subagent 之间需要互通有无（交接产出、等待依赖、协调进度、避免重复劳动）时使用这个 skill。它教你怎么把 submail 信箱系统接进派发流程：起后台 server、给这一批subagent 起名并登记、往每个任务的 prompt 里注入身份和协议说明、收尾清理。这个文件是写给你自己看的操作手册——subagent 侧怎么收发消息，它们自己会读 protocol，你不用替它们操心细节。
---

# submail：给并行subagent 接上聊天软件

## 这是什么 / 为什么要用它

你派出去的 worker subagent 之间没有任何内置的通信手段——它们是各自独立的 `run_to_completion`，互相看不见，你（主控）也要等这一批**全部跑完**才能拿回结果继续。如果这批任务之间存在依赖（A 要等 B 的产出、A 和 B 都要改同一个文件的不同部分、需要互相知会进度），subagent 之间没法协调，只能各干各的，容易冲突或者互相踩脚，不能合作完成任务，只能并行。

submail 是本机loopback的一个轻量 HTTP 信箱服务，subagent 通过 bash 调用一个 CLI 互相发信/收信。

---

## 什么时候用 / 什么时候别用

**用：**
- 这批 `worker` 类型任务之间有先后依赖（B 要等 A 交接）。
- 多个 worker 会碰到同一份共享上下文（同一份接口约定、同一个数据结构），需要互相通气避免不一致。
- 你想让它们互相打个招呼、交接完互相确认一下，减少你自己写超长 prompt 去预判所有边界情况的负担。

**别用（会话开销大于收益）：**
- 这批任务范围完全隔离（`scope` 互不相交，产出也互不依赖）——直接并行派发，不用接线。
- 只有一个 worker，或者全是 `explore` 类型——**`explore` 没有 bash 工具，物理上没法调用 submail**，给它们塞身份/协议是无效功课。
- 任务本身很短、几步就能做完——起 server、注册、写协议说明的开销比任务本身还大，不划算。

拿不准就问自己一句：这批任务里，是不是有哪个 worker 在写代码之前，**真的需要**知道另一个 worker 的产出？不需要就别接线。

---

## 激活步骤（你自己做，不是subagent 做）

### 第 0 步：确认这批任务里谁能用

只有 `subagent_type: worker` 能用 submail（有 bash 工具）。`explore` 类型直接跳过，不给它们分配代号，也不用在它们的 prompt 里提 submail 半个字。

### 第 1 步：开始前检查
```bash
where submail 2>&1 && echo 'Submail is installed.' || echo 'Cannot found submail. Install it first.' && submail server status
``` 

假如输出`Submail is installed.`，那么可以正常继续；
假如输出`Cannot found submail. Install it first.`，那么终止Skill，向用户汇报，等待用户安装submail.


### 第 2 步：给这批 worker 起代号

代号对应他们的任务属性。尽可能简短，因为在submail发送HTTP请求时使用的参数就是他们的代号。
比如: `builder`, `explorer`, `designer`

### 第 3 步：登记这批代号

**必须在派发任务之前做**，不要等subagent 自己上线了才登记：

```bash
submail server register --names builder,explorer,designer
```

这一步纯粹是预先建好信箱，不发送任何消息。跳过这步的后果：如果某个 worker 一开工就广播问候，而另一个 worker 还没轮到执行、没碰过自己的信箱，server 会认为它"不存在"，广播收不到它——先注册能保证这批人从一开始就都在花名册里。

### 第 4 步：往每个 worker 的 prompt 里塞这段（照抄，改代号和搭档列表）

```
[submail 协作]
你在这批协作里的代号是 builder；同批搭档：explorer、designer。
命令入口：submail <子命令> ...
开工第一步：跑 `submail init` 读协作协议(非常重要，必须做的第一步)，
了解怎么用 send/poll/history/status 跟搭档打招呼、交接、等回复。
```

**别漏了这几件事：**
- 代号和搭档列表要跟第 2/3 步登记的完全对上，别手误写错代号。
- 只往 `worker` 类型任务的 prompt 里塞这段；`explore` 不塞。

### 第 5 步：正常派发任务

用 task 工具照常把这批 `tasks` 发出去，这一步会阻塞到全部subagent 跑完，跟平时一样，submail 不改变这个流程，只是subagent 跑的过程中多了一条互通渠道。

---

## 主控专属命令速查

以下命令只有你会用到，subagent 不知道也不需要知道：

| 命令 | 作用 |
|---|---|
| `submail server register --names w1,w2,w3` | 派发前预登记这批代号 |
| `submail server status [--port N]` | 探活 + 打印所有信箱概览 |
| `submail server start [--port N]` | 确保 server 在后台跑；已在跑则直接返回 |
| `submail server stop [--port N]` | 优雅关闭 server 进程 |
| `submail server restart [--port N]` | 重启 server：停旧进程→起新进程，信箱/序号/日志全部清零 |

而其中 `server start`/`server restart`/`server stop` 命令由session管理，一般情况下不需要也不应该使用。

---

## 常见错误

1. **submail 没installed就直接派发** → 正常情况下 `submail` 已经由用户安装。假如没有，就需要通知用户自行使用 `skills/submail/install.sh` 安装，并重启session。
2. **先派发、后 register** → 早出发的 worker 广播问候时，晚注册的搭档还不在花名册里，收不到问候，白白浪费一轮。顺序永远是：确认submail状态 → 起名 → register → 派发。
3. **给 `explore` 类型也塞了身份** → 它没有 bash 工具，塞了也用不了，纯粹浪费 prompt 空间。
4. **依赖关系没写进 prompt，指望subagent 靠信箱自己猜** → submail 只是通信渠道，不会告诉subagent"你的队友是谁"，这层逻辑你得在派发时就点破。
