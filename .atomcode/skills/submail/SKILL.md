---
name: submail
description: 当你（主控/superagent）准备用 tasks 工具并行派发多个 worker subagent，且这些subagent 之间需要互通有无（交接产出、等待依赖、协调进度、避免重复劳动）时使用这个 skill。它教你怎么把 submail 信箱系统接进派发流程：起后台 relay、给这一批subagent 起名并登记、往每个任务的 prompt 里注入身份和协议说明、收尾清理。这个文件是写给你自己看的操作手册——subagent 侧怎么收发消息，它们自己会读 protocol.md，你不用替它们操心细节。
---

# submail：给并行subagent 接上对讲机

## 这是什么 / 为什么要用它

你派出去的 worker subagent 之间没有任何内置的通信手段——它们是各自独立的 `run_to_completion`，互相看不见，你（主控）也要等这一批**全部跑完**才能拿回结果继续。如果这批任务之间存在依赖（A 要等 B 的产出、A 和 B 都要改同一个文件的不同部分、需要互相知会进度），subagent 之间没法协调，只能各干各的，容易冲突或者互相踩脚。

submail 是本机一个轻量 HTTP 信箱服务（`127.0.0.1:8791`），subagent 通过 bash 调用一个 CLI 互相发信/收信。全套工具在这个 skill 目录的 `scripts/` 下：

```
<skill 目录>/submail/           ← skill 的实际位置可能不同：
├── SKILL.md                      可能是 ~/.atomcode/skills/submail，也可能是
├── protocol.md
├── scripts/                      项目根 .atomcode/skills/submail——下面统一用裸
│   ├── submail                   命令 `submail`，不依赖它在哪
│   ├── start_relay.ps1
│   ├── env.sh
│   ├── install.sh
│   └── submail.bat
└── src/
    ├── cli.py
    └── relay.py
```

**先用 install.sh 装 PATH（幂等，跑一次即可），之后所有命令都用裸 `submail`，不用写一长串路径：**

```bash
# 定位这个 skill 的 scripts/ 目录（两个常见位置都试一下，哪个存在用哪个）
if [ -f "$HOME/.atomcode/skills/submail/scripts/install.sh" ]; then
  SKILL_SCRIPTS="$HOME/.atomcode/skills/submail/scripts"
elif [ -f ".atomcode/skills/submail/scripts/install.sh" ]; then
  SKILL_SCRIPTS=".atomcode/skills/submail/scripts"
fi
bash "$SKILL_SCRIPTS/install.sh"     # 把 scripts/ 写进 Windows User PATH（幂等，已在则跳过）
# 本会话立刻生效（新开的进程才能继承系统 PATH，当前会话用 env.sh 补一下最稳）：
source "$SKILL_SCRIPTS/env.sh" 2>/dev/null || true
command -v submail                   # 验证：应输出 .../scripts/submail
```

装好之后，本文档所有命令一律写 `submail ...`（= `submail` 短入口，转发到 `src/cli.py`）。如果你的环境里 `submail` 仍不可用，再退回用 `bash <SKILL_SCRIPTS>/submail ...` 完整路径，但同一次会话里前后用同一种写法。

---

## 什么时候用 / 什么时候别用

**用：**
- 这批 `worker` 类型任务之间有先后依赖（B 要等 A 交接）。
- 多个 worker 会碰到同一份共享上下文（同一份接口约定、同一个数据结构），需要互相通气避免不一致。
- 你想让它们互相打个招呼、交接完互相确认一下，减少你自己写超长 prompt 去预判所有边界情况的负担。

**别用（会话开销大于收益）：**
- 这批任务范围完全隔离（`scope` 互不相交，产出也互不依赖）——直接并行派发，不用接线。
- 只有一个 worker，或者全是 `explore` 类型——**`explore` 没有 bash 工具，物理上没法调用 submail**，给它们塞身份/协议是无效功课。
- 任务本身很短、几步就能做完——起 relay、注册、写协议说明的开销比任务本身还大，不划算。

拿不准就问自己一句：这批任务里，是不是有哪个 worker 在写代码之前，**真的需要**知道另一个 worker 的产出？不需要就别接线。

---

## 激活步骤（你自己做，不是subagent 做）

### 第 0 步：确认这批任务里谁能用

只有 `subagent_type: worker` 能用 submail（有 bash 工具）。`explore` 类型直接跳过，不给它们分配代号，也不用在它们的 prompt 里提 submail 半个字。

### 第 1 步：开始前检查（relay 已由 hook 自动管理，这里只做确认）

**relay 的启停已经交给 hook 了**：项目根 `.hooks.json` 里配了 `pre_tool_use`/`post_tool_use` + matcher `"task"`——每次你调用 `task` 工具派发 subagent 批次，relay 会在派发前自动 `relay start`、批跑完后自动 `relay stop`。所以正常情况下**你不需要手动 start/stop**，只做两件轻量检查：

```bash
# ① 确认 submail 命令可用（PATH 装好了吗）
command -v submail && submail --help >/dev/null && echo "PATH OK" || echo "PATH 未装，先用完整路径"

# ② 确认 relay 状态（hook 会自起，这里看是否健康）
submail relay status
```

- 若 `relay status` 显示 `not running`：**不要慌**，说明上一个批次跑完后 hook 已按预期把它关了——派发时 hook 会自动再拉起。你只需要确认 submail 命令本身可用（PATH/完整路径）。
- 若显示 `relay: running`：也正常，直接往下走。

### 第 2 步：给这批 worker 起代号

**命名规则：`w` + 全局递增数字，编号不跨批次复用。**

先查一眼已经用过哪些编号（自愈：就算你自己在长会话里忘了记到哪了，也能从 relay 现有状态里推出来）：

```bash
submail status
```

返回的 `boxes` 字段里列了目前 relay 知道的所有信箱名。把里面 `w\d+` 格式的名字挑出来，取最大编号 N（如果一个都没有，N=0）。这一批的代号就是 `w(N+1)` 到 `w(N+worker数量)`，按你在 `tasks` 数组里派发的顺序对应分配。

**为什么不复用编号、不按任务内容起名（比如 `api-agent`）：**
- 复用编号（比如两批都用 w1）会导致新的 w1 有概率收到上一批遗留在信箱里没人收走的旧消息，读到一条不知道谁发的陈年旧信，白白让subagent 困惑。全局递增就没有这个问题。
- 代号只是路由地址，不用带语义——每个 worker 的 `description`/`prompt` 里本来就写了它具体在干什么，代号搞短一点省 token 就行。

### 第 3 步：登记这批代号

**必须在派发任务之前做**，不要等subagent 自己上线了才登记：

```bash
submail register --names w1,w2,w3
```

这一步纯粹是预先建好信箱，不发送任何消息。跳过这步的后果：如果某个 worker 一开工就广播问候，而另一个 worker 还没轮到执行、没碰过自己的信箱，relay 会认为它"不存在"，广播收不到它——先注册能保证这批人从一开始就都在花名册里。

### 第 4 步：往每个 worker 的 prompt 里塞这段（照抄，改代号和搭档列表）

```
[submail 协作]
你在这批协作里的代号是 w2；同批搭档：w1、w3。
命令入口：submail <子命令> ...（裸命令；若你的环境里 submail 不可用，退回用
完整路径 bash <SKILL_SCRIPTS>/submail <子命令> ...，二选一，前后一致）。
开工第一步：读一遍 protocol.md（用 read_file 读 <SKILL_SCRIPTS>/../protocol.md），
了解怎么用 send/poll/history/status 跟搭档打招呼、交接、等回复。
relay 已经由主控起好了，直接用，不用你自己起。
```

> 注：上面 `<SKILL_SCRIPTS>` 换成第 0 步定位到的实际路径（如 `~/.atomcode/skills/submail/scripts` 或 `.atomcode/skills/submail/scripts`），protocol.md 在它上一级目录。

**别漏了这几件事：**
- 代号和搭档列表要跟第 2/3 步登记的完全对上，别手误写错编号。
- 只往 `worker` 类型任务的 prompt 里塞这段；`explore` 不塞。
- 如果这批任务之间有明确的先后关系（比如 w2 要等 w1 交接 A 部分），在各自的 prompt 里直接点破这层依赖，别指望它们靠信箱自己猜出该等谁——"你需要 w1 完成 A 部分之后的接口定义才能开始，先用 send --wait 或者 poll --from w1 等它"这种话要写在 prompt 里。

### 第 5 步：正常派发任务

用 task 工具照常把这批 `tasks` 发出去，这一步会阻塞到全部subagent 跑完，跟平时一样，submail 不改变这个流程，只是subagent 跑的过程中多了一条互通渠道。

### 第 6 步（可选）：收尾

**默认不需要手动关**——`.hooks.json` 的 `post_tool_use` hook 会在这一批 subagent 跑完后自动 `relay stop`，relay 会随批次结束被回收，不会长期挂着。

只有一种特殊情况才手动干预：
- hook 没生效（比如你手动删了 `.hooks.json` 或改了 matcher）：批跑完后 relay 可能还挂着，用 `submail relay stop` 手动关掉。

---

## 主控专属命令速查

以下命令只有你（主控）会用到，subagent 不需要知道也调不了（`register`/`relay` 不在 `protocol.md` 里）：

| 命令 | 作用 |
|---|---|
| `submail relay start [--port N]` | 确保 relay 在后台跑；已在跑则直接返回 |
| `submail relay status [--port N]` | 探活 + 打印所有信箱概览（起名前先看这个） |
| `submail relay stop [--port N]` | 优雅关闭 relay 进程 |
| `submail register --names w1,w2,w3` | 派发前预登记这批代号 |
| `submail status` | 等价于 `relay status` 里那部分信箱概览，起名时用这个 |

subagent 自己用的 `send`/`poll`/`hello`/`history`/`status` 全部写在 `protocol.md` 里，那份文档是给subagent 读的，你不用替它们背下来，塞进 prompt 里的那句"读一遍 protocol.md"就够了。

---

## 常见错误

1. **hook 没生效就直接派发** → 正常情况下 `.hooks.json` 的 `pre_tool_use` 会在 `task` 调用前自动起 relay，`post_tool_use` 在批跑完后自动关。如果这批subagent 一调用 submail 就收到 `relay unreachable`，说明 hook 没挂上（`.hooks.json` 不在项目根？matcher 拼错？python 路径不对？）——这时退回手动 `submail relay start` 再派发，事后排查 hook 配置。subagent 会按协议自己兜底（标 `PENDING`），任务不会崩。
2. **先派发、后 register** → 早出发的 worker 广播问候时，晚注册的搭档还不在花名册里，收不到问候，白白浪费一轮。顺序永远是：起 relay → 起名 → register → 派发。
3. **给 `explore` 类型也塞了身份** → 它没有 bash 工具，塞了也用不了，纯粹浪费 prompt 空间。
4. **跨批次复用旧代号** → 可能读到上一批没人收走的陈年旧信。起名前先 `submail status` 看一眼最大编号，永远往上加。
5. **依赖关系没写进 prompt，指望subagent 靠信箱自己猜** → submail 只是通信渠道，不会告诉subagent"你该等谁"，这层逻辑你得在派发时就点破。
