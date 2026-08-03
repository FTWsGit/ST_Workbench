#!/usr/bin/env python3
"""
submail server — localhost 信箱服务，给 atomcode 子 agent 之间做互通。

零依赖（仅 Python 3.6+ 标准库）。单进程内存队列，天然原子。

协议：
  POST /send          body: {"to","from","body"}        -> 200 {"ok":true,"seq":N}
                       body: {"broadcast":true,"from","body"} -> 200 {"ok":true,"seqs":[...]}
  POST /register       body: {"names":["w1","w2",...]}  -> 200 {"ok":true,"count":N}
                       （幂等预注册信箱，见下方"关于 /register"）
  GET  /poll?to=X&timeout=N                              -> 200 {"ok":true,"msg":{...}|null}
                                                         -> 200 {"ok":false,"timeout":true}  (超时)
  GET  /drain?to=X                                       -> 200 {"ok":true,"items":[...]}
  GET  /history?to=X&limit=N                              -> 200 {"ok":true,"items":[...]}
  GET  /status?to=X        队列长度 + 最后发信人         -> 200 {"ok":true,"depth":N,"last_from":...}
  GET  /status             所有信箱概览                  -> 200 {"ok":true,"boxes":{...}}
  POST /shutdown           优雅关机（关闭 HTTP server，进程随之退出） -> 200 {"ok":true}

特性：
  - 阻塞轮询：服务端 hold 最多 timeout 秒等消息到达（默认 60，上限 300）
  - 消息序号单调递增（跨信箱全局 seq），便于调试与去重
  - 双格式日志：人类可读 lines（submail.log）+ 结构化 JSONL（submail.jsonl）
  - 只监听 127.0.0.1，不暴露网络

关于 /register（解决 broadcast 的启动顺序竞态）：
  信箱是懒创建的——只有真正被 send/poll/status 碰过的名字才会出现在 `broadcast`
  的目标列表里。如果 superagent 并行拉起多个 sub-agent，A 在 B 还没来得及碰自己
  信箱之前就发了 broadcast，B 会收不到。所以 superagent 在派发一批 sub-agent
  **之前**，应该先调一次 `submail register --names w1,w2,w3`，把这批的名字
  预先登记进 server，再派发任务。纯增量、幂等，不会清空已有信箱。

用法：
  python submail/src/server.py              # 默认 127.0.0.1:8791，日志写到 submail/log/
  python submail/src/server.py 9100         # 指定端口
  python submail/src/server.py 9100 /path   # 指定日志目录

不建议直接裸跑上面这行——它是前台阻塞进程。作为后台守护进程的启动/停止/探活，
一律走 `submail server start` / `submail server stop` / `submail server status`
（见 src/cli.py），子 agent 之间的收发也一律走 `submail send/poll/...`，
不要在 prompt 里教子 agent 裸 curl。
"""

import json
import os
import sys
import threading
import time
import uuid
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# pythonw.exe 下 stdout/stderr 是 None，print/write 会崩；重定向到 devnull 保平安。
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

HOST = "127.0.0.1"
DEFAULT_PORT = 8791
DEFAULT_TIMEOUT = 60        # poll 默认等待秒数
MAX_TIMEOUT = 300           # 与 bash 工具最大超时对齐
MAX_BODY_LEN = 64 * 1024    # 单条消息 64KB 上限，防滥用
MAX_QUEUE = 1000            # 单信箱最多堆积 1000 条，溢出丢弃并记日志
HISTORY_KEEP = 200          # 每个信箱保留最近 200 条已消费消息（复盘用）
LOG_BODY_MAX = 200          # 日志里消息正文截断长度（含省略号），避免日志被刷爆


def _truncate(s, max_len=LOG_BODY_MAX):
    """截断日志正文到 max_len 字符（按字符数，不是字节），过长加省略号。"""
    s = str(s)
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


class Mailbox:
    """线程安全的单信箱。一个信箱一个锁，互不阻塞。"""

    def __init__(self, name):
        self.name = name
        self._lock = threading.Lock()
        self._queue = deque()       # 消息列表
        self._history = deque(maxlen=HISTORY_KEEP)  # 已消费消息留档（复盘用）
        self._waiters = []          # 阻塞中的 poll 消费者
        self.last_from = None
        self.total_received = 0
        self.total_dropped = 0

    def push(self, msg):
        """入队一条消息，唤醒最早一个等待者（FIFO）。"""
        notify = None
        with self._lock:
            if len(self._queue) >= MAX_QUEUE:
                self.total_dropped += 1
                return False, "mailbox full"
            self._queue.append(msg)
            self.total_received += 1
            self.last_from = msg.get("from")
            # 唤醒队首等待者：它会在 pop 时取走最早的消息
            if self._waiters:
                notify = self._waiters.pop(0)
        if notify is not None:
            notify.set()
        return True, None

    def pop(self, deadline):
        """阻塞到 deadline 取最早一条消息；超时返回 None。"""
        evt = threading.Event()
        with self._lock:
            if self._queue:
                return self._take_locked()
            self._waiters.append(evt)

        # 释放锁后等待：要么被 push 唤醒，要么到 deadline
        remaining = deadline - time.time()
        if remaining <= 0:
            return self._cancel_waiter(evt)
        if evt.wait(remaining):
            # 被唤醒：可能有多个消费者竞争，重新走一次 pop
            return self._pop_after_wake(evt)
        # 超时
        return self._cancel_waiter(evt)

    def _take_locked(self):
        """持锁时取走最早一条消息并留档。"""
        msg = self._queue.popleft()
        self._history.append(msg)
        return msg

    def _pop_after_wake(self, evt):
        with self._lock:
            # 把自己从等待者列表摘掉（如果还在）
            try:
                self._waiters.remove(evt)
            except ValueError:
                pass
            if self._queue:
                return self._take_locked()
        # 被唤醒但队列空（被另一个消费者抢了）——立即返回 None，让调用方再 poll
        return None

    def _cancel_waiter(self, evt):
        with self._lock:
            try:
                self._waiters.remove(evt)
            except ValueError:
                pass
            if self._queue:
                return self._take_locked()
        return None

    def depth(self):
        with self._lock:
            return len(self._queue)

    def drain_all(self):
        """一次取走当前队列全部消息（每一条都留档），返回列表（FIFO 顺序）。"""
        with self._lock:
            items = []
            while self._queue:
                items.append(self._take_locked())
            return items

    def history(self, limit=20):
        """最近已消费消息（新的在前），最多 limit 条。"""
        with self._lock:
            items = list(self._history)
        items.reverse()
        return items[:limit]

    def snapshot(self):
        with self._lock:
            return {
                "depth": len(self._queue),
                "last_from": self.last_from,
                "total_received": self.total_received,
                "total_dropped": self.total_dropped,
            }


class MailServer:
    """所有信箱 + 全局序号 + 日志。"""

    def __init__(self, log_dir):
        self._boxes = {}              # name -> Mailbox
        self._boxes_lock = threading.Lock()
        self._seq = 0
        self._seq_lock = threading.Lock()
        self._started_at = time.time()
        self._log_lock = threading.Lock()

        os.makedirs(log_dir, exist_ok=True)
        self._lines_path = os.path.join(log_dir, "submail.log")
        self._jsonl_path = os.path.join(log_dir, "submail.jsonl")
        # 截断旧日志（每次 server 重启就是新会话）
        for p in (self._lines_path, self._jsonl_path):
            try:
                os.remove(p)
            except FileNotFoundError:
                pass
        self._log("START", {"log_dir": log_dir, "pid": os.getpid()})

    def _log(self, event, data):
        ts = time.time()
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(ts))}] {event} {json.dumps(data, ensure_ascii=False)}\n"
        record = {"ts": ts, "event": event, "data": data}
        with self._log_lock:
            with open(self._lines_path, "a", encoding="utf-8") as f:
                f.write(line)
            with open(self._jsonl_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")

    def _box(self, name):
        with self._boxes_lock:
            b = self._boxes.get(name)
            if b is None:
                b = Mailbox(name)
                self._boxes[name] = b
            return b

    def _push(self, to, from_, body):
        """生成一条消息并投递到信箱，返回 (ok, seq, err)。"""
        if not to or not from_:
            return False, 0, "missing 'to' or 'from'"
        if len(body) > MAX_BODY_LEN:
            return False, 0, f"body too long (>{MAX_BODY_LEN})"
        with self._seq_lock:
            self._seq += 1
            seq = self._seq
        msg = {
            "seq": seq,
            "to": to,
            "from": from_,
            "body": body,
            "ts": time.time(),
        }
        box = self._box(to)
        ok, err = box.push(msg)
        self._log("SEND", {
            "seq": seq, "to": to, "from": from_,
            "body_len": len(body), "ok": ok, "err": err,
            "body": _truncate(body),
            "depth_after": box.depth(),
        })
        if not ok:
            return False, 0, err
        return True, seq, None

    def send(self, to, from_, body):
        """单发：把消息投递给一个信箱。返回 (ok, seq, err)。"""
        return self._push(to, from_, body)

    def register(self, names):
        """预注册一批信箱名（get-or-create，幂等）。
        用于 superagent 派发新一批 sub-agent 之前，先把这批的名字登记进 server，
        避免 broadcast 只能看到"已经被碰过"的信箱、漏发给还没上线的搭档。
        不会清空/覆盖已有信箱，纯增量登记。"""
        if not names:
            return False, "missing 'names'"
        for n in names:
            if n:
                self._box(n)
        self._log("REGISTER", {"names": [n for n in names if n]})
        return True, None

    def exists(self, name):
        """某代号是否已登记。未登记视为"已离开"。"""
        if not name:
            return False
        with self._boxes_lock:
            return name in self._boxes

    def presence(self, exclude=None):
        """当前在场代号列表（已登记信箱名），可选排除自己。"""
        with self._boxes_lock:
            names = [n for n in self._boxes.keys() if n != exclude]
        return sorted(names)

    def unregister(self, name):
        """把一个代号从花名册里删掉（已不在线/已离开）。
        删除该信箱本身（清空队列/历史/等待者），后续 send/broadcast 找不到它会返回 left。
        幂等：删不存在的代号也返回 ok=True。"""
        if not name:
            return False, "missing 'name'"
        with self._boxes_lock:
            b = self._boxes.pop(name, None)
        if b is None:
            return True, None
        # 唤醒该信箱上仍在等待的 poll，让它们立即返回
        with b._lock:
            for evt in b._waiters:
                evt.set()
            b._waiters.clear()
        self._log("UNREGISTER", {"name": name})
        return True, None

    def broadcast(self, from_, body):
        """群发：发给当前所有已存在的信箱（排除自己）。返回 (ok, seqs, err)。"""
        if not from_:
            return False, None, "missing 'from'"
        with self._boxes_lock:
            targets = [n for n in self._boxes if n != from_]
        if not targets:
            return True, [], None  # 没有其他信箱：成功但零送达（无空转）
        seqs = []
        for t in targets:
            ok, seq, err = self._push(t, from_, body)
            if ok:
                seqs.append(seq)
            else:
                return False, seqs, err
        return True, seqs, None

    def poll(self, to, timeout):
        if not to:
            return False, None, "missing 'to'"
        timeout = max(0, min(int(timeout), MAX_TIMEOUT))
        box = self._box(to)
        deadline = time.time() + timeout
        msg = box.pop(deadline)
        if msg is None:
            self._log("POLL_TIMEOUT", {"to": to, "timeout": timeout})
            return True, None, None
        self._log("POLL", {
            "to": to, "seq": msg["seq"], "from": msg["from"],
            "body": _truncate(msg.get("body", "")),
        })
        return True, msg, None

    def drain(self, to):
        """一次取走某信箱当前全部消息（非阻塞，每条都留档），返回 (ok, items, err)。"""
        if not to:
            return False, None, "missing 'to'"
        box = self._box(to)
        items = box.drain_all()
        self._log("DRAIN", {
            "to": to, "count": len(items),
            "seqs": [m["seq"] for m in items],
            "bodies": [_truncate(m.get("body", "")) for m in items],
        })
        return True, items, None

    def status(self, to=None):
        if to:
            b = self._box(to)
            snap = b.snapshot()
            return True, snap, None
        with self._boxes_lock:
            boxes = {name: b.snapshot() for name, b in self._boxes.items()}
        return True, {"boxes": boxes, "uptime": time.time() - self._started_at}, None

    def history(self, to, limit=20):
        """某信箱最近已消费的消息（新的在前）。"""
        if not to:
            return False, None, "missing 'to'"
        limit = max(1, min(int(limit), HISTORY_KEEP))
        box = self._box(to)
        self._log("HISTORY", {"to": to, "limit": limit})
        return True, box.history(limit), None

    def shutdown(self):
        self._log("SHUTDOWN", {})
        # 唤醒所有等待者，让它们立即返回
        with self._boxes_lock:
            for b in self._boxes.values():
                with b._lock:
                    for evt in b._waiters:
                        evt.set()
                    b._waiters.clear()
        return True


class Handler(BaseHTTPRequestHandler):
    mail = None       # 注入 MailServer 实例
    httpd = None      # 注入 ThreadingHTTPServer 实例（shutdown 用）

    def _send_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        # 显式 flush：避免响应留在缓冲里、进程一退出就被吞掉，
        # 导致客户端收到 "Remote end closed connection without response"。
        self.wfile.flush()

    def _read_json_body(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY_LEN + 1024:
            return None, "empty or oversized body"
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode("utf-8")), None
        except (ValueError, UnicodeDecodeError) as e:
            return None, f"invalid json: {e}"

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/send":
            data, err = self._read_json_body()
            if err:
                self._send_json(400, {"ok": False, "err": err})
                return
            body = data.get("body", "")
            from_ = data.get("from", "")
            # broadcast 语义：to 为空 + broadcast=true，或 to == "*"，发给全部已知信箱。
            to = data.get("to", "")
            if data.get("broadcast") or to in ("", "*"):
                ok, seqs, e = self.mail.broadcast(from_, body)
                if ok:
                    self._send_json(200, {"ok": True, "seqs": seqs})
                else:
                    self._send_json(400, {"ok": False, "err": e})
                return
            # 单发：目标未登记视为"已离开"
            if not self.mail.exists(to):
                self._send_json(400, {"ok": False, "err": f"left: {to} 已离开"})
                return
            ok, seq, e = self.mail.send(to, from_, body)
            if ok:
                self._send_json(200, {"ok": True, "seq": seq})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/register":
            data, err = self._read_json_body()
            if err:
                self._send_json(400, {"ok": False, "err": err})
                return
            names = data.get("names") or []
            ok, e = self.mail.register(names)
            if ok:
                self._send_json(200, {"ok": True, "count": len([n for n in names if n])})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/unregister":
            data, err = self._read_json_body()
            if err:
                self._send_json(400, {"ok": False, "err": err})
                return
            name = data.get("name", "")
            ok, e = self.mail.unregister(name)
            if ok:
                self._send_json(200, {"ok": True, "left": name})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/shutdown":
            # 顺序不能反：先回响应（_send_json 已 flush，响应一定写回 socket），
            # 再唤醒 poll 等待者、最后换线程关 server——否则客户端会收到
            # "Remote end closed connection without response"（连接被掐断、响应没拿到）。
            self._send_json(200, {"ok": True})
            self.mail.shutdown()
            # 真正让进程退出：httpd.shutdown() 会让 main() 里的 serve_forever() 返回，
            # 从而 main() 正常 return、进程随之退出。换一个线程去调用，
            # 避免在当前请求线程里同步阻塞导致响应发不出去。
            threading.Thread(target=self.httpd.shutdown, daemon=True).start()
            return
        self._send_json(404, {"ok": False, "err": "not found"})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/poll":
            qs = parse_qs(parsed.query)
            to = qs.get("to", [""])[0]
            timeout = qs.get("timeout", [str(DEFAULT_TIMEOUT)])[0]
            ok, msg, e = self.mail.poll(to, timeout)
            if ok and msg is not None:
                self._send_json(200, {"ok": True, "msg": msg})
            elif ok:
                self._send_json(200, {"ok": False, "timeout": True})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/drain":
            qs = parse_qs(parsed.query)
            to = qs.get("to", [""])[0]
            ok, items, e = self.mail.drain(to)
            if ok:
                self._send_json(200, {"ok": True, "items": items})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/history":
            qs = parse_qs(parsed.query)
            to = qs.get("to", [""])[0]
            limit = qs.get("limit", ["20"])[0]
            ok, items, e = self.mail.history(to, limit)
            if ok:
                self._send_json(200, {"ok": True, "items": items})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/status":
            qs = parse_qs(parsed.query)
            to = qs.get("to", [None])[0]
            ok, data, e = self.mail.status(to)
            if ok:
                self._send_json(200, {"ok": True, **data})
            else:
                self._send_json(400, {"ok": False, "err": e})
            return
        if parsed.path == "/presence":
            qs = parse_qs(parsed.query)
            exclude = qs.get("exclude", [None])[0]
            names = self.mail.presence(exclude=exclude)
            self._send_json(200, {"ok": True, "present": names})
            return
        if parsed.path == "/exists":
            qs = parse_qs(parsed.query)
            name = qs.get("name", [""])[0]
            self._send_json(200, {"ok": True, "exists": self.mail.exists(name)})
            return
        if parsed.path == "/":
            self._send_json(200, {"ok": True, "service": "submail", "uptime": time.time() - self.mail._started_at})
            return
        self._send_json(404, {"ok": False, "err": "not found"})

    def log_message(self, fmt, *args):
        # 让 stderr 干净点；详细日志走 submail.log
        sys.stderr.write(f"{self.address_string()} - {fmt % args}\n")


def main():
    port = DEFAULT_PORT
    # 脚本在 src/ 下，默认日志写到上层 log/（用户要求日志集中）。
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "log")
    args = sys.argv[1:]
    if args:
        try:
            port = int(args[0])
        except ValueError:
            print(f"invalid port: {args[0]}", file=sys.stderr)
            sys.exit(1)
    if len(args) >= 2:
        log_dir = args[1]

    mail = MailServer(log_dir)
    Handler.mail = mail

    server = ThreadingHTTPServer((HOST, port), Handler)
    Handler.httpd = server
    print(f"submail server on http://{HOST}:{port}  (logs: {log_dir})", flush=True)
    print(f"  POST /send     GET /poll?to=&timeout=    GET /drain?to=    GET /status[?to=]    GET /history?to=&limit=    POST /shutdown", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down…", flush=True)
        mail.shutdown()
        server.shutdown()


if __name__ == "__main__":
    main()
