#!/usr/bin/env python3
"""
submail CLI — 子 agent 互通的命令包装（不裸 curl）。

三个身份类 flag，含义永远不变，跟哪个命令搭配都一样：
  --me    我是谁（自己的信箱 id）
  --to    发给谁（收件人）
  --from  信是谁发的（用来过滤/核对来信，不是"我"）

子 agent 通过 bash 调用：

  submail send --to w2 --me w1 --body "你好"
      → 发信，不等回复。成功: `sent seq=3 to=w2`；失败自动重试一次。

  submail send --to w2 --me w1 --body "B部分完成了吗？" --wait 90
      → 发信 + 顺带等对方回信（一步到位，等价于以前的 ask）。
        拿到回复: `msg from=w2 seq=N` + 换行 + body 原文
        超时: `no-reply from=w2 after=90s`

  submail send --broadcast --me w1 --body "大家好"
      → 群发：发给当前全部已知信箱（排除自己），不填 --to，不能跟 --wait 一起用。

  submail poll --me w1 --wait 60
      → 收信，从自己的信箱取一封（谁的信都算），最多阻塞 wait 秒。
        有信: `msg from=w2 seq=1` + 换行 + body 原文
        超时: `timeout no-message-after=60s`（不是错误，本轮无人写信）

  submail poll --me w1 --wait 90 --from w2
      → 只要 w2 的信：旁人的信自动跳过继续等，直到等到或超时。
        跟 `send --wait` 是同一套等待逻辑，两种写法效果一样，选顺手的用。
        超时: `no-reply from=w2 after=90s`

  submail poll --me w1 --all
      → 一次取走信箱里当前全部消息（非阻塞），适合攒了几封一起读。
        有信: `drained 2` + 每封 `[seq=N from=X] body`
        没信: `drained 0`（不是错误）

  submail hello --me w1 --body ...
      → 开工自检 + 上线问候：验证 server 在线、自己信箱可写，向搭档广播问候（--to 可省略则问候全部）。

  submail history --me w1 [--limit 20] [--full]
      → 复盘：本信箱最近已读的消息（新的在前，默认每行摘要）。

  submail status [--me w1]
      → 看当前谁在场（presence）；给了 --me X 就把 X 自己从在场列表里排掉。

  submail init
      → 打印协作协议全文（protocol.md）——开工读协议用这个，不用 read_file、不用维护路径。

短别名（想少打字就用）: -m=--me  -t=--to  -f=--from  -b=--body  -w=--wait  -a=--all  -l=--limit

环境变量: SUBMAIL_URL 可覆盖服务地址。
所有子 agent 命令（send/poll/hello/history/status/exit）都支持 --port 指定 server 端口，
覆盖 SUBMAIL_URL/DEFAULT_URL —— 与 `server start --port <非默认端口>` 配套使用。
所有命令 exit 0 = 命令本身执行成功（timeout/no-reply 也是成功）；exit 1 = 网络/协议/逻辑错误（error: 前缀）；exit 2 = 参数用法错误（argparse 默认）。
"""

import argparse
import json
import os
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PORT = 8791  # server 默认监听端口（#25 共享常量）
DEFAULT_URL = f"http://127.0.0.1:{DEFAULT_PORT}"
MAX_TIMEOUT = 300  # 与 server 服务端上限一致
POLL_SLICE = 45    # ask 内部每轮 poll 的最长切片，便于穿插检查剩余时间

# —— 超时/等待相关 ——
# argparse help 里反复出现的有效等待上限：留 20s 余量给 bash 工具超时
EFFECTIVE_WAIT_CAP = MAX_TIMEOUT - 20
# _wait_for_from 里每轮 poll 切片下限：避免 remaining<1 时 int()=0 导致空转刷请求
POLL_SECS_FLOOR = 1
# _request 默认超时（秒）；各 cmd 按需覆盖
REQUEST_TIMEOUT_DEFAULT = 10
# 校验对方是否在场（/exists）的轻量请求超时
EXISTS_CHECK_TIMEOUT = 5

# —— 日志/摘要截断 ——
# _rotate_log_if_large：日志文件超此大小就轮转
LOG_ROTATE_MAX_BYTES = 5 * 1024 * 1024
# _log_cli：jsonl record 里 result 字段截断上限
LOG_RESULT_TRUNCATE = 2000
# _body_summary：body 摘要截断上限
BODY_SUMMARY_LIMIT = 1000
# cmd_history：每条 body 默认截断上限（--full 可绕过）
HISTORY_BODY_TRUNCATE = 2000


def _cli_log_dir():
    """subagent CLI 命令日志目录，与 server 日志同放 submail/log/。"""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "..", "log")


def _rotate_log_if_large(path, max_bytes=LOG_ROTATE_MAX_BYTES):
    """#23：日志文件超过 max_bytes（默认 5MB）就轮转：当前文件改名 <name>.old（覆盖旧 .old），再开新文件。
    用 os.path.getsize 检查大小，整体 try/except 兜住，失败静默跳过（继续 append）。"""
    try:
        if os.path.exists(path) and os.path.getsize(path) > max_bytes:
            old_path = path + ".old"
            if os.path.exists(old_path):
                os.remove(old_path)
            os.rename(path, old_path)
    except OSError:
        pass


def _human_line(cmd, args_dict, result):
    """人类可读的语义化日志行：`[HH:MM:SS] 谁 cmd 方向 "body摘要" → result`。
    send/hello 的 body 从参数取（result 里只有 sent seq，看不到内容）；
    poll/history/status 的内容已含在 result 里，直接展示。
    result 多行（poll 的正文、status 的在场名单）压平成单行 ` | ` 分隔，保证日志每行完整。"""
    me = args_dict.get("me") or ""
    to = args_dict.get("to") or ""
    body = args_dict.get("body") or ""
    body_q = json.dumps(_body_summary(body), ensure_ascii=False) if body else ""
    flat = " | ".join((result or "").splitlines())

    if cmd == "send":
        if args_dict.get("broadcast"):
            return f"{me} send broadcast {body_q} → {flat}" if body_q else f"{me} send broadcast → {flat}"
        return f"{me} send → {to} {body_q} → {flat}" if body_q else f"{me} send → {to} → {flat}"
    if cmd == "poll":
        frm = args_dict.get("from_") or ""
        opts = (" --all" if args_dict.get("all") else "") + (f" --from {frm}" if frm else "")
        return f"{me} poll{opts} → {flat}"
    if cmd == "hello":
        return f"{me} hello {body_q} → {flat}" if body_q else f"{me} hello → {flat}"
    if cmd == "history":
        return f"{me} history → {flat}"
    if cmd == "status":
        box = args_dict.get("box") or ""
        return f"{me} status{(' --box ' + box) if box else ''} → {flat}"
    if cmd == "exit":
        return f"{me} exit → {flat}"
    if cmd == "init":
        return f"{me} init → 协议全文({len(result or '')}字)"
    if cmd == "register":
        return f"server register {args_dict.get('names')} → {flat}"
    if cmd == "server":
        return f"server {args_dict.get('server_cmd') or ''} → {flat}"
    return f"{cmd} → {flat}"


def _log_cli(cmd, args_dict, result):
    """记录 subagent 执行的 CLI 命令到 submail-cli.log/.jsonl。
    submail-cli.log 是人类可读的语义化行（含 body 内容，视觉无成本）；
    submail-cli.jsonl 保留结构化字段。error/no-reply/timeout 都记。"""
    log_dir = _cli_log_dir()
    try:
        os.makedirs(log_dir, exist_ok=True)
    except OSError:
        return
    lines_path = os.path.join(log_dir, "submail-cli.log")
    jsonl_path = os.path.join(log_dir, "submail-cli.jsonl")
    ts = time.time()
    # from 语义：poll --from 是等待的对象（dest=from_）；send/hello 的发信人就是 me
    from_val = args_dict.get("from_")
    if from_val is None and cmd in ("send", "hello"):
        from_val = args_dict.get("me")
    # 构造 from→to 顺序的语义字段
    record = {
        "ts": ts,
        "cmd": cmd,
        "me": args_dict.get("me"),
        "from": from_val,
        "to": args_dict.get("to"),
        "broadcast": args_dict.get("broadcast"),
        "body": _body_summary(args_dict.get("body") or ""),
        "result": (result or "")[:LOG_RESULT_TRUNCATE],
    }
    # 清理 None 值，让日志更干净
    record = {k: v for k, v in record.items() if v is not None}
    # 人类可读行：简短时间 + 语义顺序（谁 对谁 做了什么 "内容" → 结果）
    stamp = time.strftime('%H:%M:%S', time.localtime(ts))
    line = f"[{stamp}] {_human_line(cmd, args_dict, result)}\n"
    try:
        # #23：写日志前检查文件大小，超过 5MB 先轮转，避免 cli 日志无限膨胀。
        _rotate_log_if_large(lines_path)
        _rotate_log_if_large(jsonl_path)
        with open(lines_path, "a", encoding="utf-8") as f:
            f.write(line)
        with open(jsonl_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _base_url():
    return os.environ.get("SUBMAIL_URL", DEFAULT_URL).rstrip("/")


def _request(method, path, payload=None, timeout=REQUEST_TIMEOUT_DEFAULT):
    """返回 (parsed_json, err)。网络/HTTP 错误转成 err，不让异常裸奔。"""
    url = _base_url() + path
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            return body, None
        except Exception:
            return None, f"server http {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return None, f"server unreachable: {e.reason}"
    except Exception as e:
        return None, f"server error: {e}"


def _send_once(to, from_, body):
    """发一条，返回 (ok, seq_or_err, is_deterministic)。不重试。
    is_deterministic=True 表示确定性错误（目标已离开），上层不应重试。"""
    payload = {"to": to, "from": from_, "body": body}
    data, err = _request("POST", "/send", payload=payload)
    if err:
        return False, err, False  # 网络/协议错误：瞬态，可重试
    if data.get("ok"):
        return True, data["seq"], False
    err_str = data.get("err", "unknown")
    # server 返回 "left: X 已离开" / "left: X 未登记/已离开" —— 目标不存在，重试无意义
    is_det = err_str.startswith("left:")
    return False, err_str, is_det


def _do_send(to, from_, body):
    """发信 + 失败自动重试一次（瞬态错误）。确定性错误（left）直接返回不重试。
    返回 (ok, 描述)。"""
    ok, res, is_det = _send_once(to, from_, body)
    if ok:
        return True, f"ok: now={_now_prefix()} sent to={to}"
    if is_det:
        return False, f"error: {res}"
    # 自动重试一次（瞬态错误常见；body 不变）
    ok2, res2, _ = _send_once(to, from_, body)
    if ok2:
        return True, f"ok: now={_now_prefix()} sent to={to} (after retry)"
    return False, f"error: {res2}"


def _do_broadcast(from_, body):
    """群发（发给当前全部已知信箱，排除自己）+ 失败自动重试一次（瞬态错误）。
    返回 (ok, delivered, failed)；delivered 是 [(seq, target), ...]，
    failed 是 [(target, err), ...]。"""
    payload = {"from": from_, "body": body, "broadcast": True}
    data, err = _request("POST", "/send", payload=payload)
    if not err and data.get("ok"):
        return True, data.get("delivered") or [], data.get("failed") or []
    # 首轮整体失败：若是瞬态错误（网络/协议），重试一次；确定性整体失败直接返回
    data2, err2 = _request("POST", "/send", payload=payload)
    if err2:
        return False, [], err2
    if data2.get("ok"):
        return True, data2.get("delivered") or [], data2.get("failed") or []
    return False, [], data2.get("err", "unknown")


def cmd_send(args):
    """send --to w2 --me w1 --body "..."            单发，发完就走
       send --to w2 --me w1 --body "..." --wait 90  发完顺带等对方回信（原 ask）
       send --broadcast --me w1 --body "..."        群发（不填 --to；不能和 --wait 一起用）"""
    if args.port:
        _pin_server_url_to_port(args.port)
    if args.broadcast:
        if args.wait:
            return "error: --wait 只能配合单发 --to 使用，不能和 --broadcast 一起用（可用 submail send --help 查看）"
        if args.to:
            return "error: --to 和 --broadcast 互斥：群发自动发给全部已知信箱，不能同时指定 --to（可用 submail send --help 查看）"
        if not args.me:
            return "error: --me 必须提供（如 w1）（可用 submail send --help 查看）"
        ok, delivered, failed = _do_broadcast(args.me, args.body)
        if not ok:
            return f"error: {delivered}"
        # delivered 是 [(seq, target), ...]，显示发给谁
        targets = ", ".join(t for _, t in delivered)
        out = "ok: now={} sent to={}".format(_now_prefix(), targets)
        if failed:
            fl = ", ".join(f"{t}({e})" for t, e in failed)
            out += " failed=[{}]".format(fl)
        return out
    if not args.to or not args.me:
        return "error: 单发需要 --to 和 --me（如 w1/w2/w3）；群发用 --broadcast 可省略 --to（可用 submail send --help 查看）"
    ok, out = _do_send(args.to, args.me, args.body)
    if not ok:
        return out  # error: 前缀
    if args.wait:
        return _wait_for_from(args.to, args.me, args.wait)
    return out  # _do_send 已带 ok: 前缀


def _fmt_ts(ts):
    """epoch 秒 → HH:MM:SS 简短时间（用消息自带的 ts，便于 sub 判断消息新旧）；无 ts 返回空串。"""
    if not ts:
        return ""
    return time.strftime("%H:%M:%S", time.localtime(ts))


def _now_prefix():
    """当前本地时间 HH:MM:SS，作为所有结果行的 now 锚点，方便 AI 对比消息时间。"""
    return time.strftime("%H:%M:%S", time.localtime())


def _body_summary(body, limit=BODY_SUMMARY_LIMIT):
    """body 摘要（#19）：压平换行、截断到 limit 字符（超长加 …）。"""
    text = (body or "").replace("\n", " ")
    if len(text) > limit:
        text = text[:limit] + "…"
    return text


def _stray_desc(stray):
    """把等待期间顺手取走的 stray 消息列表格式化成 `(from=X HH:MM:SS: 摘要)` 逗号串。"""
    return ", ".join(
        f"(from={f} {_fmt_ts(t)}: {_body_summary(b)})" for s, f, b, t in stray
    )


def _fmt_items(items):
    """把一批消息按发信人分组、组内按发信时间排序输出。
    格式：每个发信人一行头 `from=X (N条)`，下面每条 `  HH:MM:SS body`。"""
    if not items:
        return ""
    groups = {}
    for m in items:
        f = m.get("from") or "?"
        groups.setdefault(f, []).append(m)
    blocks = []
    for f in sorted(groups.keys()):
        msgs = sorted(groups[f], key=lambda x: x.get("ts") or 0)
        blocks.append("from={} ({}条)".format(f, len(msgs)))
        for m in msgs:
            body = (m.get("body", "") or "").replace("\n", " ")
            blocks.append("  {} {}".format(_fmt_ts(m.get("ts")), body))
    return "\n".join(blocks)


def _wait_for_from(target_from, own_id, wait):
    """阻塞等 own_id 信箱里来自 target_from 的消息。
    等到目标第一封后，drain 信箱里当前全部消息（含旁人）一并返回。
    超时也 drain 全部积压返回，但体现"目标还没来信"。
    target_from 已 exit 时，先 drain 它发过的积压，最后一行说已离开。
    返回输出文本；只有 error: 前缀是失败。"""
    wait = max(0, min(wait, MAX_TIMEOUT))
    deadline = time.time() + wait
    drain_from = "/drain?to=" + urllib.parse.quote(own_id, safe="") + "&from=" + urllib.parse.quote(target_from, safe="")
    while True:
        # 只 drain target_from 的信，旁人的留在信箱
        ddata, derr = _request("GET", drain_from, timeout=REQUEST_TIMEOUT_DEFAULT)
        if derr:
            return f"error: {derr}"
        if not ddata.get("ok"):
            return f"error: {ddata.get('err', 'unknown')}"
        pending = ddata.get("items") or []
        # 检查 target 是否还在场（exit 了要单独处理）
        gdata, gerr = _request("GET", "/exists?name=" + urllib.parse.quote(target_from, safe=""), timeout=EXISTS_CHECK_TIMEOUT)
        if gerr:
            return f"error: {gerr}"
        target_exists = gdata.get("exists")
        if pending:
            # 目标来信了：返回它的全部积压（旁人在信箱里没动）
            # 若 target 同时已 exit，带上 left 标志，让最后一行说已离开
            return _format_poll_result(pending, target_from=target_from, timed_out=False, left=not target_exists)
        # 没等到目标的信——先看 target 还在不在场
        if not target_exists:
            # 目标已 exit 且没积压：最后一行说已离开
            return _format_poll_result([], target_from=target_from, timed_out=False, left=True)
        # target 还在场但没来信：看还有没有时间等
        remaining = deadline - time.time()
        if remaining <= 0:
            # 超时：没拉到 target 的信，体现超时
            return _format_poll_result([], target_from=target_from, timed_out=True)
        # 还有时间，阻塞 poll 等下一封（用短切片便于穿插检查 exit）
        slice_secs = min(POLL_SLICE, remaining)
        poll_secs = max(POLL_SECS_FLOOR, int(slice_secs))
        path = "/poll?to={}&timeout={}".format(urllib.parse.quote(own_id, safe=""), poll_secs)
        data, err = _request("GET", path, timeout=poll_secs + 10)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            if data.get("left"):
                return f"error: left: {target_from} 已离开"
            if data.get("timeout"):
                continue  # 本轮无人来信，回循环 drain 一遍再决定
            return f"error: {data.get('err', 'unknown')}"
        # 收到一封，回循环 drain target 的全部积压


def _format_poll_result(items, target_from=None, timed_out=False, left=False):
    """统一格式化 poll/drain 的返回。带 now 锚点、按发信人分组。
    timed_out=True：目标还没来信，体现超时。
    left=True：目标已 exit，最后一行说已离开。"""
    head = "ok: now={}".format(_now_prefix())
    if not items:
        if left:
            return head + "\nno messages\nnote: {} 已离开".format(target_from)
        if timed_out:
            return head + "\nno messages\ntimeout: {} 还没来信".format(target_from)
        return head + "\ndrained 0"
    body_block = _fmt_items(items)
    status_line = None
    if left:
        status_line = "note: {} 已离开".format(target_from)
    elif timed_out:
        status_line = "timeout: {} 还没来信".format(target_from)
    parts = [head, "drained {} 条".format(len(items)), body_block]
    if status_line:
        parts.append(status_line)
    return "\n".join(parts)


def cmd_register(args):
    """register --names w1,w2,w3：派发新一批 sub-agent 之前预登记信箱名（幂等）。
    只影响 broadcast 能看到谁；不发送任何消息。"""
    names = [n.strip() for n in (args.names or "").split(",") if n.strip()]
    if not names:
        return "error: --names 不能为空，如 w1,w2,w3"
    data, err = _request("POST", "/register", payload={"names": names}, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    return "ok: now={} registered {}".format(_now_prefix(), ",".join(names))


def cmd_poll(args):
    """poll --me w1                       默认非阻塞：drain 信箱里当前全部消息，按发信人排列
       poll --me w1 --from w2            只要 w2 的信：非阻塞 drain 全部（含旁人），按发信人排列
       poll --me w1 --from w2 --wait 60  阻塞等 w2 第一封，等到后 drain 全部积压；超时也 drain 全部但体现超时
       poll --me w1 --wait 60            阻塞等任意一封（不带 --from 时退化到旧单发语义）
       poll --me w1 --all                一次取走信箱当前全部消息（非阻塞，忽略 --wait/--from）"""
    if args.port:
        _pin_server_url_to_port(args.port)
    # --all：批量收信，一次取走全部（非阻塞）
    if args.all:
        path = "/drain?to=" + urllib.parse.quote(args.me, safe="")
        data, err = _request("GET", path, timeout=REQUEST_TIMEOUT_DEFAULT)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            return f"error: {data.get('err', 'unknown')}"
        items = data.get("items") or []
        return _format_poll_result(items)
    # --from：按 target 处理（默认非阻塞即 --wait 0）
    if args.from_:
        return _wait_for_from(args.from_, args.me, args.wait)
    # 不带 --from：阻塞等任意一封（旧语义），--wait 0 时立即 drain 全部
    wait = max(0, min(args.wait, MAX_TIMEOUT))
    if wait == 0:
        path = "/drain?to=" + urllib.parse.quote(args.me, safe="")
        data, err = _request("GET", path, timeout=REQUEST_TIMEOUT_DEFAULT)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            return f"error: {data.get('err', 'unknown')}"
        items = data.get("items") or []
        return _format_poll_result(items)
    path = "/poll?to={}&timeout={}".format(urllib.parse.quote(args.me, safe=""), wait)
    data, err = _request("GET", path, timeout=wait + 10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        if data.get("timeout"):
            return "ok: now={}\ntimeout no-message-after={}s".format(_now_prefix(), wait)
        return f"error: {data.get('err', 'unknown')}"
    msg = data.get("msg") or {}
    return "ok: now={}\nmsg {} from={}\n{}".format(
        _now_prefix(), _fmt_ts(msg.get("ts")), msg.get("from"), msg.get("body", "")
    )


def cmd_hello(args):
    """hello 别名：开工自检 + 上线问候；--to 给了问候列表，省略则问候全部已知信箱。"""
    if args.port:
        _pin_server_url_to_port(args.port)
    if not args.me:
        return "error: --me 必须提供（如 w1）"
    # 1) 自检：server 在线 + 自己信箱可写
    data, err = _request("GET", "/status?to=" + urllib.parse.quote(args.me, safe=""), timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    # 2) 上线问候
    body = args.body or "嗨，我是 {me}！我上线了，随时找我协作～".format(me=args.me)
    targets = [t.strip() for t in (args.to or "").split(",") if t.strip()]
    if targets:
        # 逐目标问候：用 _send_once 拿原始 seq；失败的（left 等）单独列出，不谎报
        seqs = []
        failed = []
        for t in targets:
            ok, res, _ = _send_once(t, args.me, body)
            if ok:
                seqs.append(res)
            else:
                failed.append((t, res))
        out = "ok: now={} hello: server ok, mailbox={} writable, sent to={}".format(
            _now_prefix(), args.me, ",".join(targets)
        )
        if failed:
            fl = ", ".join(f"{t}({e})" for t, e in failed)
            out += " failed=[{}]".format(fl)
        return out
    ok, delivered, failed = _do_broadcast(args.me, body)
    if not ok:
        return f"error: {delivered}"
    targets = ", ".join(t for _, t in delivered)
    out = "ok: now={} hello: server ok, mailbox={} writable, sent to={}".format(
        _now_prefix(), args.me, targets
    )
    if failed:
        fl = ", ".join(f"{t}({e})" for t, e in failed)
        out += " failed=[{}]".format(fl)
    return out


def cmd_history(args):
    if args.port:
        _pin_server_url_to_port(args.port)
    path = "/history?to={}&limit={}".format(
        urllib.parse.quote(args.me, safe=""), max(1, min(args.limit, 200))
    )
    data, err = _request("GET", path, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    items = data.get("items") or []
    # --from X：只看 X 的记录（像微信单聊历史）
    if getattr(args, "from_", None):
        items = [m for m in items if m.get("from") == args.from_]
    if not items:
        # 空态引导：顺手查一下未读数，有信就提示 poll，避免误判"没人发过信"
        sdata, serr = _request("GET", "/status?to=" + urllib.parse.quote(args.me, safe=""), timeout=10)
        depth = 0
        if not serr and sdata.get("ok"):
            depth = sdata.get("depth") or 0
        if depth > 0:
            return f"ok: now={_now_prefix()} history: {args.me} 暂无已读消息，但有 {depth} 封未读 —— 用 `submail poll --me {args.me} --all` 收取"
        return f"ok: now={_now_prefix()} history: {args.me} 暂无已读消息"
    # 按发信人分组，组内按发信时间正序（旧→新），对 LLM 友好
    groups = {}
    for m in items:
        f = m.get("from") or "?"
        groups.setdefault(f, []).append(m)
    blocks = ["ok: now={} history ({} 条)".format(_now_prefix(), len(items))]
    for f in sorted(groups.keys()):
        msgs = sorted(groups[f], key=lambda x: x.get("ts") or 0)
        blocks.append("from={} ({}条)".format(f, len(msgs)))
        for m in msgs:
            head = "{}".format(m.get("body", ""))
            if not args.full and len(head) > HISTORY_BODY_TRUNCATE:
                head = head[:HISTORY_BODY_TRUNCATE] + "…"
            blocks.append("  {} {}".format(_fmt_ts(m.get("ts")), head.replace("\n", " ")))
    return "\n".join(blocks)

def cmd_status(args):
    """子 agent 用的 status：默认看当前谁在场（presence）；--box X 查指定信箱的
    未读/已读状态（depth/last_from/total_received），让发送者能看到对方 poll 过没有。"""
    if args.port:
        _pin_server_url_to_port(args.port)
    if args.box:
        path = "/status?to=" + urllib.parse.quote(args.box, safe="")
        data, err = _request("GET", path, timeout=10)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            return f"error: {data.get('err', 'unknown')}"
        if data.get("exists") is False:
            return f"ok: now={_now_prefix()} status: box={args.box} 未登记/已离开"
        depth = data.get("depth") or 0
        last_from = data.get("last_from") or "-"
        received = data.get("total_received") or 0
        dropped = data.get("total_dropped") or 0
        return "ok: now={} status: box={} depth={} 未读 last_from={} total_received={} dropped={}".format(
            _now_prefix(), args.box, depth, last_from, received, dropped
        )
    exclude = None
    if args.me:
        exclude = args.me
    path = "/presence"
    if exclude:
        path += "?exclude=" + urllib.parse.quote(exclude, safe="")
    data, err = _request("GET", path, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    present = data.get("present") or []
    # --me X：加一行 self 状态，让用户一眼确认自己还在不在场（#10）
    self_line = None
    if args.me:
        sdata, serr = _request(
            "GET", "/exists?name=" + urllib.parse.quote(args.me, safe=""), timeout=EXISTS_CHECK_TIMEOUT
        )
        if serr:
            self_line = "self: 状态未知（{}）".format(serr)
        else:
            self_line = "self: 在场" if sdata.get("exists") else "self: 已离开"
    prefix = "ok: now={}".format(_now_prefix())
    if self_line:
        prefix += "\n" + self_line
    if not present:
        return prefix + "\nstatus: 当前没有其他队友在场"
    return prefix + "\nstatus: 在场队友 {}\n{}".format(
        len(present), ", ".join(present)
    )


def cmd_exit(args):
    """exit --me X：把自己从服务器里删掉（已离开）。
    幂等；之后别人 send/poll --from X 会拿到 left 提示。"""
    if args.port:
        _pin_server_url_to_port(args.port)
    if not args.me:
        return "error: --me 必须提供（如 w1）"
    data, err = _request("POST", "/unregister", payload={"name": args.me}, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    return "ok: now={} exit: {} 已离开".format(_now_prefix(), args.me)


def cmd_init(args):
    """打印协作协议全文（protocol.md）。子 agent 开工读协议用：不用 read_file、不用知道 skill 目录在哪。"""
    proto = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "protocol.md")
    try:
        with open(proto, encoding="utf-8") as f:
            return f.read().rstrip("\n")
    except OSError as e:
        return f"error: 读取 protocol.md 失败: {e}"


# ---------------------------------------------------------------------------
# server 守护进程生命周期（给 superagent 用，不是给子 agent 用）。
#
# 场景：superagent 派发一批子 agent 之前，需要确保 server 已经在后台跑起来，
# 且这一步调用本身必须"发出去就能立刻拿回控制权"——因为 superagent 自己没有
# loop，下一步紧接着就要用另一个工具调用去派发任务。`python server.py` 本身是
# 前台阻塞进程，不能直接当这一步来跑；这里改用平台原生的方式把它拉成一个
# 独立的后台进程，然后轮询探活，探活成功（或最多等 ~3s）就返回。
# ---------------------------------------------------------------------------

def _server_healthy(timeout=2):
    """探活：GET / 能不能拿到 submail 的身份应答。"""
    data, err = _request("GET", "/", timeout=timeout)
    return bool(data) and not err and data.get("ok") and data.get("service") == "submail"


def _server_paths():
    here = os.path.dirname(os.path.abspath(__file__))  # .../submail/src
    return {
        "src_dir": here,
        "server_py": os.path.join(here, "server.py"),
        "start_ps1": os.path.join(here, "..", "scripts", "start_server.ps1"),
        "log_dir": os.path.join(here, "..", "log"),
    }


def _to_windows_path(p):
    """尽量转成 Windows 路径给 PowerShell 用；非 Windows / 没有 cygpath 就原样返回。"""
    try:
        out = subprocess.run(["cygpath", "-w", p], capture_output=True, text=True, timeout=5)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    return p


def _looks_like_windows():
    # Git Bash 下 platform.system() 通常仍是 'Windows'（或部分环境是 'MINGW64_NT-...' via uname）；
    # 双保险再看一下 OS 环境变量。
    if platform.system() == "Windows":
        return True
    return "windows" in os.environ.get("OS", "").lower()


def _start_via_powershell(server_py, port):
    """Windows：经 WMI 托管创建 server 进程（start_server.ps1）。
    WMI 创建的进程不在调用方的进程树/Job Object 里，跨 bash 调用存活，且不弹控制台窗口。"""
    paths = _server_paths()
    win_python = _to_windows_path(sys.executable)
    win_server = _to_windows_path(server_py)
    result = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", paths["start_ps1"],
         "-PythonPath", win_python, "-ServerPath", win_server, "-Port", str(port)],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "powershell start 失败").strip())
    pid_text = (result.stdout or "").strip().splitlines()[-1] if result.stdout.strip() else ""
    return int(pid_text)


def _start_via_posix(server_py, port):
    """非 Windows 兜底：setsid 风格全脱离（start_new_session=True 相当于 setsid），
    stdio 全部丢掉/关闭，避免拖住父进程的管道。"""
    proc = subprocess.Popen(
        [sys.executable, server_py, str(port)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return proc.pid


def _pin_server_url_to_port(port):
    """让本次进程内的 _base_url() 指向 --port 指定的端口。
    只影响当前 cli.py 进程自己的后续请求，不污染外部环境。"""
    if port:
        os.environ["SUBMAIL_URL"] = f"http://127.0.0.1:{port}"


def cmd_server_start(args):
    _pin_server_url_to_port(args.port)
    if _server_healthy():
        return "server: already running (healthy)"

    paths = _server_paths()
    os.makedirs(paths["log_dir"], exist_ok=True)
    pid_file = os.path.join(paths["log_dir"], "server.pid")

    try:
        if _looks_like_windows():
            pid = _start_via_powershell(paths["server_py"], args.port)
        else:
            pid = _start_via_posix(paths["server_py"], args.port)
    except Exception as e:
        return f"error: 启动 server 失败: {e}"

    try:
        with open(pid_file, "w") as f:
            f.write(str(pid))
    except OSError:
        pass  # pid 文件写不写不影响功能，stop 主要靠 HTTP /shutdown

    # 轮询探活，最多约 3 秒；不管等没等到都会返回，不会无限阻塞。
    for _ in range(20):
        if _server_healthy(timeout=1):
            return f"server: started pid={pid} port={args.port}"
        time.sleep(0.15)
    return (f"server: started pid={pid} port={args.port} 但 3s 内探活未成功 —— "
            f"看看 submail/log/submail-server.log 排查，或稍后 `server status` 再确认")


def cmd_server_stop(args):
    _pin_server_url_to_port(args.port)
    if not _server_healthy(timeout=2):
        return "server: not running (or already down)"
    data, err = _request("POST", "/shutdown", payload={}, timeout=5)
    if err:
        return f"error: {err}"
    for _ in range(15):
        if not _server_healthy(timeout=1):
            return "server: stopped"
        time.sleep(0.2)
    return "server: 已发送 shutdown，但仍在响应 —— 可能需要手动结束进程（看 log/server.pid）"


def cmd_server_restart(args):
    """重启 server：先停掉旧进程（若在跑），再重新拉起。
    信箱/全局序号/日志都存在内存里，新进程一启动就是全零状态，旧通信被清空。"""
    _pin_server_url_to_port(args.port)
    if _server_healthy(timeout=2):
        data, err = _request("POST", "/shutdown", payload={}, timeout=5)
        if err:
            return f"error: {err}"
        for _ in range(15):
            if not _server_healthy(timeout=1):
                break
            time.sleep(0.2)
        if _server_healthy(timeout=1):
            return "error: 旧 server 收到 shutdown 后 3s 内未退出 —— 手动结束进程（看 log/server.pid）后重试"
    return cmd_server_start(args)


def cmd_server_status(args):
    _pin_server_url_to_port(args.port)
    if not _server_healthy(timeout=2):
        return "server: not running"
    data, err = _request("GET", "/status", timeout=5)
    if err:
        return f"error: {err}"
    return "server: running\n" + json.dumps(data, ensure_ascii=False)


def cmd_server(args):
    return {"start": cmd_server_start, "stop": cmd_server_stop, "restart": cmd_server_restart, "status": cmd_server_status}[args.server_cmd](args)


def main():
    parser = argparse.ArgumentParser(
        prog="submail",
        description="子 agent 互通信箱 CLI。核心记 3 个词：--me(我是谁) --to(发给谁) --from(信是谁发的)。",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_send = sub.add_parser(
        "send",
        help="发消息；不加 --wait 就是发完即走，加了 --wait 就顺带等对方回信（相当于以前的 ask）",
    )
    p_send.add_argument("--to", "-t", default="", help="收件人 id，如 w2（--broadcast 时省略）")
    p_send.add_argument("--broadcast", action="store_true", help="群发：发给当前全部已知信箱（排除自己），省略 --to，不能和 --wait 同用")
    p_send.add_argument("--me", "-m", required=True, help="我是谁，如 w1")
    p_send.add_argument("--body", "-b", required=True, help="消息内容（≤64KB 文本）")
    p_send.add_argument("--wait", "-w", type=int, default=0,
                         help=f"发完顺带等对方回信，最长秒数；不填=发完就走（实际有效上限 {EFFECTIVE_WAIT_CAP}，避免撞 bash 工具超时）")
    p_send.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_send.set_defaults(fn=cmd_send)

    p_poll = sub.add_parser(
        "poll",
        help="收信；--from 可选=只要指定人的信（旁人的信自动跳过）；--all=一次取走全部",
    )
    p_poll.add_argument("--me", "-m", required=True, help="我是谁，即查哪个信箱")
    p_poll.add_argument("--wait", "-w", type=int, default=0, help=f"阻塞等任意一封的秒数（默认 0=非阻塞 drain 全部，上限 {EFFECTIVE_WAIT_CAP}，避免撞 bash 工具超时）")
    p_poll.add_argument("--from", "-f", dest="from_", metavar="FROM", default="",
                         help="只要这个人的信；不填=谁的信都算，来一封拿一封")
    p_poll.add_argument("--all", "-a", action="store_true", help="一次取走信箱当前全部消息（非阻塞，忽略 --wait/--from）")
    p_poll.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_poll.set_defaults(fn=cmd_poll)

    p_hi = sub.add_parser("hello", help="开工自检 + 上线问候（别名）：--to 给了问候列表，省略则问候全部已知信箱")
    p_hi.add_argument("--me", "-m", required=True, help="我是谁，如 w1")
    p_hi.add_argument("--to", "-t", default="", help="搭档列表（可选），如 w2,w3；省略则问候全部已知信箱")
    p_hi.add_argument("--body", "-b", default="", help="Hello的内容")
    p_hi.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_hi.set_defaults(fn=cmd_hello)

    p_hist = sub.add_parser("history", help="复盘：最近已消费消息，按发信人分组、组内时间正序")
    p_hist.add_argument("--me", "-m", required=True, help="我是谁，即查哪个信箱")
    p_hist.add_argument("--from", "-f", dest="from_", default="", help="只看这个人的记录（像微信单聊历史）")
    p_hist.add_argument("--limit", "-l", type=int, default=20, help="最多返回条数（默认 20，最大 200）")
    p_hist.add_argument("--full", action="store_true", help="显示完整 body（默认截断）")
    p_hist.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_hist.set_defaults(fn=cmd_history)

    p_status = sub.add_parser("status", help="看当前谁在场（presence），--me X 排除自己；--box X 查指定信箱未读/已读状态")
    p_status.add_argument("--me", "-m", help="我是谁；给了就从在场列表里排掉自己")
    p_status.add_argument("--box", dest="box", default="", help="查指定信箱的未读/已读状态（depth/last_from/total_received）")
    p_status.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_status.set_defaults(fn=cmd_status)

    p_init = sub.add_parser("init", help="开工读协议：打印 protocol.md 全文（不用 read_file、不用维护路径）")
    p_init.set_defaults(fn=cmd_init)

    p_exit = sub.add_parser("exit", help="完成任务想返回时用：把自己从花名册删掉（已离开）")
    p_exit.add_argument("--me", "-m", required=True, help="我是谁，如 w1")
    p_exit.add_argument("--port", type=int, default=None, help=f"server 端口（默认 {DEFAULT_PORT}，一般不用填）")
    p_exit.set_defaults(fn=cmd_exit)

    p_server = sub.add_parser("server", help="server 守护进程生命周期（给 superagent 用：start/stop/restart/status/register）")
    server_sub = p_server.add_subparsers(dest="server_cmd", required=True)
    p_server_start = server_sub.add_parser("start", help="确保 server 在后台跑起来（已在跑则直接返回，不会重复启动）")
    p_server_start.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"server 监听端口（默认 {DEFAULT_PORT}）")
    p_server_stop = server_sub.add_parser("stop", help="POST /shutdown 优雅关闭 server 进程")
    p_server_stop.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"server 监听端口（默认 {DEFAULT_PORT}）")
    p_server_restart = server_sub.add_parser("restart", help="重启 server：清空旧信箱/旧消息/旧日志后重新拉起")
    p_server_restart.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"server 监听端口（默认 {DEFAULT_PORT}）")
    p_server_status_p = server_sub.add_parser("status", help="探活 + 打印所有信箱概览")
    p_server_status_p.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"server 监听端口（默认 {DEFAULT_PORT}）")
    p_server_reg = server_sub.add_parser("register", help="派发新一批子 agent 前预登记信箱名（幂等，只影响 broadcast 能看到谁）")
    p_server_reg.add_argument("--names", required=True, help="逗号分隔的信箱名，如 w1,w2,w3")
    p_server_reg.set_defaults(fn=cmd_register)
    p_server.set_defaults(fn=cmd_server)

    args = parser.parse_args()
    out = args.fn(args)
    # 记录 subagent 执行的 CLI 命令到 submail-cli.log/.jsonl（debug 真实命令使用）
    _log_cli(args.cmd, vars(args), out)
    print(out)
    # 成败约定：成功路径以 "ok:" 开头，失败路径以 "error:" 开头。
    # server 命令 / init（协议全文）等非 ok:/error: 输出也当成功（exit 0）。
    return 1 if isinstance(out, str) and out.startswith("error:") else 0


if __name__ == "__main__":
    sys.exit(main())
