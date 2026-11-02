"""Harness / MCP 服务测试调用日志

每次调用持久化到本地 jsonl 文件（data/mcp_logs.jsonl），支持：
- 历史记录查看（全部保留，list_logs 最新在前）
- token 用量记录（从返回 usage 提取）
- 单次成本估算（服务基准价 × 数量；按量计费服务暂估 0，标注估算）
- 统计详情（次数/成功/失败/耗时/成本/token，支持按服务维度）
"""
import json
import time
import uuid
from pathlib import Path

from .. import config

LOG_FILE = Path(config.DATA_DIR) / "mcp_logs.jsonl"

# 单次成本基准价（元）：来自百炼控制台价格。按量/规格计费服务无固定单价，暂估 0。
_UNIT_COST = {
    "image": 0.24,          # ¥0.24/张
    "code": 0.05,           # ¥0.05/次
    "web_search": 0.03,     # ¥0.03/次（不含 token，token 单独统计）
    "web_parser": 0.002,    # ¥0.002/次
    "vertical_search": 0.03,  # ¥0.03/次
    "tts": 0.00012,         # ¥1.2/万字符 → 0.00012/字符
    "video": 0.0,           # 88 折按量，暂估 0
    "asr": 0.0,             # 按秒
    "rag": 0.0,             # 规格费用
    "memory": 0.0,          # 按使用
    "agent": 0.0,           # 会话运行时
    "sandbox": 0.0,         # 按使用
}


def _load_all() -> list:
    if not LOG_FILE.exists():
        return []
    out = []
    try:
        with open(LOG_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except Exception:  # noqa: BLE001
                        pass
    except Exception:  # noqa: BLE001
        pass
    return out


def _extract_tokens(output) -> dict:
    if isinstance(output, dict):
        u = output.get("usage")
        if isinstance(u, dict):
            return {
                "input": u.get("input_tokens") or u.get("prompt_tokens") or 0,
                "output": u.get("output_tokens") or u.get("completion_tokens") or 0,
                "total": u.get("total_tokens") or 0,
            }
        if "input_tokens" in output:
            return {
                "input": output.get("input_tokens") or 0,
                "output": output.get("output_tokens") or 0,
                "total": output.get("total_tokens") or 0,
            }
    return {"input": 0, "output": 0, "total": 0}


def _estimate_cost(service_id: str, params: dict, output) -> float:
    base = _UNIT_COST.get(service_id, 0.0)
    n = 1
    if service_id == "image":
        n = int(params.get("n") or 1)
    elif service_id == "tts":
        t = params.get("prompt") or params.get("text") or ""
        n = max(1, len(t))
    return round(base * n, 4)


def add_log(service_id: str, name: str, params: dict, output, elapsed_ms: float, ok: bool) -> dict:
    tokens = _extract_tokens(output)
    cost = _estimate_cost(service_id, params or {}, output)
    rec = {
        "id": f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "service_id": service_id,
        "name": name,
        "params": params or {},
        "output": output,
        "tokens": tokens,
        "cost": cost,
        "elapsed_ms": int(elapsed_ms),
        "ok": bool(ok),
        "created_at": int(time.time() * 1000),
    }
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
    except Exception:  # noqa: BLE001
        pass
    return rec


def list_logs(service_id: str = None, limit: int = 50) -> list:
    objs = _load_all()
    if service_id:
        objs = [o for o in objs if o.get("service_id") == service_id]
    objs.sort(key=lambda r: r.get("created_at", 0) or 0, reverse=True)
    return objs[:limit]


def stats(service_id: str = None) -> dict:
    objs = _load_all()
    if service_id:
        objs = [o for o in objs if o.get("service_id") == service_id]
    total = len(objs)
    ok_n = sum(1 for o in objs if o.get("ok"))
    t_in = sum((o.get("tokens") or {}).get("input", 0) for o in objs)
    t_out = sum((o.get("tokens") or {}).get("output", 0) for o in objs)
    t_total = sum((o.get("tokens") or {}).get("total", 0) for o in objs)
    elapsed = sum(o.get("elapsed_ms", 0) or 0 for o in objs)
    cost = round(sum(o.get("cost", 0) or 0 for o in objs), 4)
    per = {}
    for o in objs:
        sid = o.get("service_id")
        b = per.setdefault(sid, {"count": 0, "ok": 0, "cost": 0.0, "elapsed_ms": 0, "tokens_in": 0, "tokens_out": 0})
        b["count"] += 1
        if o.get("ok"):
            b["ok"] += 1
        b["cost"] += o.get("cost", 0) or 0
        b["elapsed_ms"] += o.get("elapsed_ms", 0) or 0
        b["tokens_in"] += (o.get("tokens") or {}).get("input", 0)
        b["tokens_out"] += (o.get("tokens") or {}).get("output", 0)
    by_service = [dict(v, service_id=k) for k, v in per.items()]
    by_service.sort(key=lambda b: b["count"], reverse=True)
    return {
        "total": total,
        "ok": ok_n,
        "fail": total - ok_n,
        "success_rate": round(ok_n / total * 100, 1) if total else 0,
        "total_cost": cost,
        "total_elapsed_ms": elapsed,
        "tokens": {"input": t_in, "output": t_out, "total": t_total},
        "by_service": by_service,
    }
