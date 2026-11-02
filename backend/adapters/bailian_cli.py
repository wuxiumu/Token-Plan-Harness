"""百炼 CLI 适配器

统一封装 `bl` 命令调用，返回结构化 JSON。
所有命令在真实系统上通过子进程执行；NO_COLOR 关闭着色，--output json 机器可读。

注意：usage summary/stats/free 等 Console 命令需要显式 --workspace-id 才有输出；
token-plan 数据不需要 workspace-id。
"""
import json
import os
import subprocess
from typing import Any, Optional


def _run(args: list[str], workspace_id: Optional[str] = None, timeout: int = 60) -> Optional[Any]:
    cmd = ["bl"] + args + ["--output", "json"]
    if workspace_id:
        cmd += ["--workspace-id", workspace_id]
    env = dict(os.environ)
    env["NO_COLOR"] = "1"
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return {"error": f"timeout after {timeout}s", "cmd": " ".join(cmd)}
    except FileNotFoundError:
        return {"error": "bl not found; install bailian-cli first", "cmd": " ".join(cmd)}
    out = (p.stdout or "").strip()
    if not out:
        # 无输出：可能是无数据或静默失败，回退 stderr
        err = (p.stderr or "").strip()
        return {"error": err or "no output", "rc": p.returncode, "cmd": " ".join(cmd)}
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out, "rc": p.returncode}


class BailianCli:
    def __init__(self, workspace_id: Optional[str] = None):
        self.workspace_id = workspace_id

    def auth_status(self):
        return _run(["auth", "status"])

    # ---- 用量 ----
    def usage_summary(self, days: int = 30):
        return _run(["usage", "summary", "--days", str(days)], self.workspace_id)

    def usage_stats(self, days: int = 30, model: Optional[str] = None):
        args = ["usage", "stats", "--days", str(days)]
        if model:
            args += ["--model", model]
        return _run(args, self.workspace_id)

    def usage_free(self):
        return _run(["usage", "free"], self.workspace_id)

    def usage_token_plan(self):
        return _run(["usage", "token-plan"])

    def usage_coding_plan(self):
        return _run(["usage", "coding-plan"])

    # ---- Harness 权益 ----
    def harness_quota(self, type_: Optional[str] = None):
        args = ["token-plan", "harness-quota"]
        if type_:
            args += ["--type", type_]
        return _run(args, self.workspace_id)

    def list_seats(self):
        return _run(["token-plan", "list-seats"])

    # ---- 监控 ----
    def monitor_overview(self):
        return _run(["monitor", "overview"], self.workspace_id)

    def monitor_models(self):
        return _run(["monitor", "models"], self.workspace_id)

    # ---- 工作区 ----
    def workspace_list(self):
        return _run(["workspace", "list"])
