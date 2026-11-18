"""Read the signed-in Codex account's rate limits through its app-server protocol."""
import json
import queue
import subprocess
import threading
import time

from ..storage import get_storage
from . import cache_settings

_lock = threading.Lock()


def _fetch_usage():
    try:
        proc = subprocess.Popen(["codex", "app-server"], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, bufsize=1)
    except FileNotFoundError:
        return {"status": "unavailable", "message": "未找到 Codex CLI，请安装并登录。"}
    lines = queue.Queue()
    def read():
        for line in proc.stdout:
            lines.put(line)
        lines.put(None)
    threading.Thread(target=read, daemon=True).start()
    try:
        def send(obj):
            proc.stdin.write(json.dumps(obj) + "\n")
            proc.stdin.flush()
        def response(request_id):
            deadline = time.monotonic() + 15
            while True:
                line = lines.get(timeout=max(0, deadline - time.monotonic()))
                if line is None:
                    raise RuntimeError("Codex 服务已退出")
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                if msg.get("id") == request_id:
                    if "error" in msg:
                        raise RuntimeError("Codex 无法读取额度，请检查登录状态和网络")
                    return msg.get("result", {})
        send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "token_plan_harness", "title": "Token Plan Harness", "version": "1.0"}}})
        response(1)
        send({"method": "initialized"})
        send({"id": 2, "method": "account/rateLimits/read", "params": {"excludeResetCreditDetails": True}})
        result = response(2)
        buckets = result.get("rateLimitsByLimitId") or {"codex": result.get("rateLimits")}
        return {"status": "ok", "buckets": [v for v in buckets.values() if v], "updated_at": int(time.time())}
    except (queue.Empty, RuntimeError, OSError):
        return {"status": "unavailable", "message": "无法读取 Codex 额度，请检查 Codex 登录状态、网络及账户支持情况。"}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc.stdin.close()
        proc.stdout.close()


def get_usage(force=False, cache_only=False):
    if cache_only:
        return cache_settings.cached_result(get_storage().get_snapshot('stats', 'codex_usage'))
    with _lock:
        store = get_storage()
        snap = store.get_snapshot("stats", "codex_usage")
        now = time.time()
        if not force and snap and now - snap["_t"] < cache_settings.ttl_seconds():
            return {**snap["data"], "cached": True, "stale": False}
        data = _fetch_usage()
        if data.get("status") == "ok":
            store.set_snapshot("stats", "codex_usage", {"_t": time.time(), "data": data})
            return {**data, "cached": False, "stale": False}
        if snap:
            return {**snap["data"], "cached": True, "stale": True, "message": data.get("message")}
        return data
