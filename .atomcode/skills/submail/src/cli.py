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

  submail hello --me w1 --to w2,w3
      → 开工自检 + 上线问候：验证 relay 在线、自己信箱可写，向搭档广播问候（--to 可省略则问候全部）。

  submail history --me w1 [--limit 20] [--full]
      → 复盘：本信箱最近已消费的消息（新的在前，默认每行摘要）。

  submail status [--me w1]
      → 信箱深度 / 最后发信人 / 累计收信数（省略 --me 查全部）。

短别名（想少打字就用）: -m=--me  -t=--to  -f=--from  -b=--body  -w=--wait  -a=--all  -l=--limit

环境变量: SUBMAIL_URL 可覆盖服务地址（默认 http://127.0.0.1:8791）。
所有命令 exit 0 = 命令本身执行成功（timeout/no-reply 也是成功）；exit 1 = 用法/网络/协议错误。
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

DEFAULT_URL = "http://127.0.0.1:8791"
MAX_TIMEOUT = 300  # 与 relay 服务端上限一致
POLL_SLICE = 45    # ask 内部每轮 poll 的最长切片，便于穿插检查剩余时间


def _base_url():
    return os.environ.get("SUBMAIL_URL", DEFAULT_URL).rstrip("/")


def _request(method, path, payload=None, timeout=10):
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
            return None, f"relay http {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return None, f"relay unreachable: {e.reason}"
    except Exception as e:
        return None, f"relay error: {e}"


def _send_once(to, from_, body):
    """发一条，返回 (ok, seq_or_err)。不重试。"""
    payload = {"to": to, "from": from_, "body": body}
    data, err = _request("POST", "/send", payload=payload)
    if err:
        return False, err
    if data.get("ok"):
        return True, data["seq"]
    return False, data.get("err", "unknown")


def _do_send(to, from_, body):
    """发信 + 失败自动重试一次。返回 (ok, 描述)。"""
    ok, res = _send_once(to, from_, body)
    if ok:
        return True, f"sent seq={res} to={to}"
    # 自动重试一次（瞬态错误常见；body 不变）
    ok2, res2 = _send_once(to, from_, body)
    if ok2:
        return True, f"sent seq={res2} to={to} (after retry)"
    return False, f"error: {res2}"


def _do_broadcast(from_, body):
    """群发（发给当前全部已知信箱，排除自己）+ 失败自动重试一次。返回 (ok, 描述)。"""
    payload = {"from": from_, "body": body, "broadcast": True}
    data, err = _request("POST", "/send", payload=payload)
    if not err and data.get("ok"):
        seqs = data.get("seqs") or []
        return True, "broadcast sent={} seqs=[{}]".format(
            len(seqs), ", ".join(f"seq={s}" for s in seqs)
        )
    # 自动重试一次
    data2, err2 = _request("POST", "/send", payload=payload)
    if err2:
        return False, f"error: {err2}"
    if data2.get("ok"):
        seqs = data2.get("seqs") or []
        return True, "broadcast sent={} seqs=[{}] (after retry)".format(
            len(seqs), ", ".join(f"seq={s}" for s in seqs)
        )
    return False, f"error: {data2.get('err', 'unknown')}"


def cmd_send(args):
    """send --to w2 --me w1 --body "..."            单发，发完就走
       send --to w2 --me w1 --body "..." --wait 90  发完顺带等对方回信（原 ask）
       send --broadcast --me w1 --body "..."        群发（不填 --to；不能和 --wait 一起用）"""
    if args.broadcast:
        if args.wait:
            return "error: --wait 只能配合单发 --to 使用，不能和 --broadcast 一起用"
        if not args.me:
            return "error: --me 必须提供（如 w1）"
        ok, out = _do_broadcast(args.me, args.body)
        return out
    if not args.to or not args.me:
        return "error: 单发需要 --to 和 --me（如 w1/w2/w3）；群发用 --broadcast 可省略 --to"
    ok, out = _do_send(args.to, args.me, args.body)
    if not ok:
        return out  # error: 前缀
    if args.wait:
        return _wait_for_from(args.to, args.me, args.wait)
    return out


def _wait_for_from(target_from, own_id, wait):
    """阻塞等 own_id 信箱里来自 target_from 的消息；跳过其他搭档的信继续等。
    send --wait 和 poll --from 都走这一个函数，行为完全一致。
    返回输出文本；只有 error: 前缀是失败。"""
    deadline = time.time() + max(0, min(wait, MAX_TIMEOUT))
    stray = []  # [(seq, from)] 期间被跳过（顺手取走）的其他人的消息
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            if stray:
                seqs = ", ".join(f"seq={s}(from={f})" for s, f in stray)
                return f"no-reply from={target_from} after={wait}s (saw others: {seqs})"
            return f"no-reply from={target_from} after={wait}s"
        slice_secs = min(POLL_SLICE, remaining)
        # 下限 1 秒：避免 remaining<1 时 int()=0 导致 0 秒空转（狂刷几十个请求）。
        poll_secs = max(1, int(slice_secs))
        path = "/poll?to={}&timeout={}".format(
            urllib.parse.quote(own_id, safe=""), poll_secs
        )
        data, err = _request("GET", path, timeout=poll_secs + 10)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            if data.get("timeout"):
                continue  # 本轮无人来信，剩余时间继续等
            return f"error: {data.get('err', 'unknown')}"
        msg = data.get("msg") or {}
        if msg.get("from") == target_from:
            return "msg from={} seq={}\n{}".format(
                msg.get("from"), msg.get("seq"), msg.get("body", "")
            )
        # 别人的消息：记一笔，继续等目标回复
        stray.append((msg.get("seq"), msg.get("from")))


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
    return "registered {}".format(",".join(names))


def cmd_poll(args):
    """poll --me w1 --wait 60             收一封（谁的信都行）
       poll --me w1 --wait 60 --from w2   只要 w2 的信，旁人的信跳过继续等，直到等到或超时
       poll --me w1 --all                 一次取走信箱当前全部消息（非阻塞，忽略 --wait/--from）"""
    if args.all:
        # 批量收信：一次取走信箱当前全部消息
        path = "/drain?to=" + urllib.parse.quote(args.me, safe="")
        data, err = _request("GET", path, timeout=10)
        if err:
            return f"error: {err}"
        if not data.get("ok"):
            return f"error: {data.get('err', 'unknown')}"
        items = data.get("items") or []
        if not items:
            return "drained 0"
        lines = ["drained {}".format(len(items))]
        for m in items:
            lines.append("[seq={} from={}] {}".format(
                m.get("seq"), m.get("from"), (m.get("body", "") or "").replace("\n", " ")
            ))
        return "\n".join(lines)
    if args.from_:
        # 只等指定的人：跟 send --wait 共用同一套跳过-旁人逻辑
        return _wait_for_from(args.from_, args.me, args.wait)
    wait = max(0, min(args.wait, MAX_TIMEOUT))
    path = "/poll?to={}&timeout={}".format(
        urllib.parse.quote(args.me, safe=""), wait
    )
    # 客户端超时比服务端多留 10s 缓冲，避免卡在传输层。
    data, err = _request("GET", path, timeout=wait + 10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        if data.get("timeout"):
            return f"timeout no-message-after={wait}s"
        return f"error: {data.get('err', 'unknown')}"
    msg = data.get("msg") or {}
    return "msg from={} seq={}\n{}".format(msg.get("from"), msg.get("seq"), msg.get("body", ""))


def cmd_hello(args):
    """hello 别名：开工自检 + 上线问候；--to 给了问候列表，省略则问候全部已知信箱。"""
    if not args.me:
        return "error: --me 必须提供（如 w1）"
    # 1) 自检：relay 在线 + 自己信箱可写
    data, err = _request("GET", "/status?to=" + urllib.parse.quote(args.me, safe=""), timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    # 2) 广播上线问候
    body = "嗨，我是 {me}！我上线了，随时找我协作～".format(me=args.me)
    targets = [t.strip() for t in (args.to or "").split(",") if t.strip()]
    if targets:
        ok, res = _do_send(targets[0], args.me, body)
        if not ok:
            return res
        seqs = [res]
        for t in targets[1:]:
            ok2, res2 = _do_send(t, args.me, body)
            if ok2:
                seqs.append(res2)
        return "hello: relay ok, mailbox={} writable, greeted {} seqs=[{}]".format(
            args.me, ",".join(targets), ", ".join(seqs)
        )
    ok, out = _do_broadcast(args.me, body)
    if not ok:
        return out
    return "hello: relay ok, mailbox={} writable, greeted all seqs=[{}]".format(
        args.me, out.replace("broadcast sent=", "").replace(" seqs=", "")
    )


def cmd_history(args):
    path = "/history?to={}&limit={}".format(
        urllib.parse.quote(args.me, safe=""), max(1, min(args.limit, 200))
    )
    data, err = _request("GET", path, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    items = data.get("items") or []
    if not items:
        return f"history: {args.me} 暂无已消费消息"
    lines = []
    for m in items:
        head = "{}".format(m.get("body", ""))
        if not args.full and len(head) > 120:
            head = head[:120] + "…"
        lines.append("[seq={} from={}] {}".format(
            m.get("seq"), m.get("from"), head.replace("\n", " ")
        ))
    return "history {} ({})\n{}".format(args.me, len(items), "\n".join(lines))


def cmd_status(args):
    path = "/status"
    if args.me:
        path += "?to=" + urllib.parse.quote(args.me, safe="")
    data, err = _request("GET", path, timeout=10)
    if err:
        return f"error: {err}"
    if not data.get("ok"):
        return f"error: {data.get('err', 'unknown')}"
    return json.dumps(data, ensure_ascii=False)


# ---------------------------------------------------------------------------
# relay 守护进程生命周期（给 superagent 用，不是给子 agent 用）。
#
# 场景：superagent 派发一批子 agent 之前，需要确保 relay 已经在后台跑起来，
# 且这一步调用本身必须"发出去就能立刻拿回控制权"——因为 superagent 自己没有
# loop，下一步紧接着就要用另一个工具调用去派发任务。`python relay.py` 本身是
# 前台阻塞进程，不能直接当这一步来跑；这里改用平台原生的方式把它拉成一个
# 独立的后台进程，然后轮询探活，探活成功（或最多等 ~3s）就返回。
# ---------------------------------------------------------------------------

def _relay_healthy(timeout=2):
    """探活：GET / 能不能拿到 submail 的身份应答。"""
    data, err = _request("GET", "/", timeout=timeout)
    return bool(data) and not err and data.get("ok") and data.get("service") == "submail"


def _relay_paths():
    here = os.path.dirname(os.path.abspath(__file__))  # .../submail/src
    return {
        "src_dir": here,
        "relay_py": os.path.join(here, "relay.py"),
        "start_ps1": os.path.join(here, "..", "scripts", "start_relay.ps1"),
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


def _start_via_powershell(relay_py, port):
    """Windows：经 WMI 托管创建 relay 进程（start_relay.ps1）。
    WMI 创建的进程不在调用方的进程树/Job Object 里，跨 bash 调用存活，且不弹控制台窗口。"""
    paths = _relay_paths()
    win_python = _to_windows_path(sys.executable)
    win_relay = _to_windows_path(relay_py)
    result = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", paths["start_ps1"],
         "-PythonPath", win_python, "-RelayPath", win_relay, "-Port", str(port)],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "powershell start 失败").strip())
    pid_text = (result.stdout or "").strip().splitlines()[-1] if result.stdout.strip() else ""
    return int(pid_text)


def _start_via_posix(relay_py, port):
    """非 Windows 兜底：setsid 风格全脱离（start_new_session=True 相当于 setsid），
    stdio 全部丢掉/关闭，避免拖住父进程的管道。"""
    proc = subprocess.Popen(
        [sys.executable, relay_py, str(port)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return proc.pid


def _pin_relay_url_to_port(port):
    """让本次进程内的 _base_url() 指向 --port 指定的端口（而不是默认/环境变量里的 8791）。
    只影响当前 cli.py 进程自己的后续请求，不污染外部环境。"""
    if port:
        os.environ["SUBMAIL_URL"] = f"http://127.0.0.1:{port}"


def cmd_relay_start(args):
    _pin_relay_url_to_port(args.port)
    if _relay_healthy():
        return "relay: already running (healthy)"

    paths = _relay_paths()
    os.makedirs(paths["log_dir"], exist_ok=True)
    pid_file = os.path.join(paths["log_dir"], "relay.pid")

    try:
        if _looks_like_windows():
            pid = _start_via_powershell(paths["relay_py"], args.port)
        else:
            pid = _start_via_posix(paths["relay_py"], args.port)
    except Exception as e:
        return f"error: 启动 relay 失败: {e}"

    try:
        with open(pid_file, "w") as f:
            f.write(str(pid))
    except OSError:
        pass  # pid 文件写不写不影响功能，stop 主要靠 HTTP /shutdown

    # 轮询探活，最多约 3 秒；不管等没等到都会返回，不会无限阻塞。
    for _ in range(20):
        if _relay_healthy(timeout=1):
            return f"relay: started pid={pid} port={args.port}"
        time.sleep(0.15)
    return (f"relay: started pid={pid} port={args.port} 但 3s 内探活未成功 —— "
            f"看看 submail/log/submail.log 排查，或稍后 `relay status` 再确认")


def cmd_relay_stop(args):
    _pin_relay_url_to_port(args.port)
    if not _relay_healthy(timeout=2):
        return "relay: not running (or already down)"
    data, err = _request("POST", "/shutdown", payload={}, timeout=5)
    if err:
        return f"error: {err}"
    for _ in range(15):
        if not _relay_healthy(timeout=1):
            return "relay: stopped"
        time.sleep(0.2)
    return "relay: 已发送 shutdown，但仍在响应 —— 可能需要手动结束进程（看 log/relay.pid）"


def cmd_relay_status(args):
    _pin_relay_url_to_port(args.port)
    if not _relay_healthy(timeout=2):
        return "relay: not running"
    data, err = _request("GET", "/status", timeout=5)
    if err:
        return f"error: {err}"
    return "relay: running\n" + json.dumps(data, ensure_ascii=False)


def cmd_relay(args):
    return {"start": cmd_relay_start, "stop": cmd_relay_stop, "status": cmd_relay_status}[args.relay_cmd](args)


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
                         help=f"发完顺带等对方回信，最长秒数；不填=发完就走（最大 {MAX_TIMEOUT}）")
    p_send.set_defaults(fn=cmd_send)

    p_poll = sub.add_parser(
        "poll",
        help="收信；--from 可选=只要指定人的信（旁人的信自动跳过）；--all=一次取走全部",
    )
    p_poll.add_argument("--me", "-m", required=True, help="我是谁，即查哪个信箱")
    p_poll.add_argument("--wait", "-w", type=int, default=60, help=f"阻塞秒数（默认 60，最大 {MAX_TIMEOUT}）")
    p_poll.add_argument("--from", "-f", dest="from_", default="",
                         help="只要这个人的信；不填=谁的信都算，来一封拿一封")
    p_poll.add_argument("--all", "-a", action="store_true", help="一次取走信箱当前全部消息（非阻塞，忽略 --wait/--from）")
    p_poll.set_defaults(fn=cmd_poll)

    p_hi = sub.add_parser("hello", help="开工自检 + 上线问候（别名）：--to 给了问候列表，省略则问候全部已知信箱")
    p_hi.add_argument("--me", "-m", required=True, help="我是谁，如 w1")
    p_hi.add_argument("--to", "-t", default="", help="搭档列表（可选），如 w2,w3；省略则问候全部已知信箱")
    p_hi.set_defaults(fn=cmd_hello)

    p_hist = sub.add_parser("history", help="复盘：最近已消费消息（新的在前）")
    p_hist.add_argument("--me", "-m", required=True, help="我是谁，即查哪个信箱")
    p_hist.add_argument("--limit", "-l", type=int, default=20, help="最多返回条数（默认 20，最大 200）")
    p_hist.add_argument("--full", action="store_true", help="显示完整 body（默认截断到 120 字）")
    p_hist.set_defaults(fn=cmd_history)

    p_status = sub.add_parser("status", help="查询信箱状态")
    p_status.add_argument("--me", "-m", help="只查自己；省略则查全部信箱")
    p_status.set_defaults(fn=cmd_status)

    p_reg = sub.add_parser("register", help="派发新一批子 agent 前预登记信箱名（幂等，只影响 broadcast 能看到谁）")
    p_reg.add_argument("--names", required=True, help="逗号分隔的信箱名，如 w1,w2,w3")
    p_reg.set_defaults(fn=cmd_register)

    p_relay = sub.add_parser("relay", help="relay 守护进程生命周期（给 superagent 用：start/stop/status）")
    relay_sub = p_relay.add_subparsers(dest="relay_cmd", required=True)
    p_relay_start = relay_sub.add_parser("start", help="确保 relay 在后台跑起来（已在跑则直接返回，不会重复启动）")
    p_relay_start.add_argument("--port", type=int, default=8791, help="relay 监听端口（默认 8791）")
    p_relay_stop = relay_sub.add_parser("stop", help="POST /shutdown 优雅关闭 relay 进程")
    p_relay_stop.add_argument("--port", type=int, default=8791, help="relay 监听端口（默认 8791）")
    p_relay_status_p = relay_sub.add_parser("status", help="探活 + 打印所有信箱概览")
    p_relay_status_p.add_argument("--port", type=int, default=8791, help="relay 监听端口（默认 8791）")
    p_relay.set_defaults(fn=cmd_relay)

    args = parser.parse_args()
    out = args.fn(args)
    print(out)
    # timeout / no-reply / sent / msg / reply / broadcast / hello / history / status 都是成功路径；
    # 只有 error: 前缀是失败。
    return 1 if isinstance(out, str) and out.startswith("error:") else 0


if __name__ == "__main__":
    sys.exit(main())
