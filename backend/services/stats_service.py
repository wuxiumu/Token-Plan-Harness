"""统计服务：实时拉取百炼用量/权益 + 本地累计用量聚合"""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional

from .. import config
from ..adapters.bailian_cli import BailianCli
from ..models import UsageRecord
from ..storage import get_storage

REC_NS = "usage_record"
SNAP_NS = "stats"
CACHE_TTL = 30 * 60  # 30 分钟缓存一次，默认读缓存为主；手动刷新才强制重新拉取


def _sum_usage(records: list[dict]) -> dict:
    total_in = sum(r.get("input_tokens", 0) for r in records)
    total_out = sum(r.get("output_tokens", 0) for r in records)
    total = sum(r.get("total_tokens", 0) for r in records)
    cost = round(sum(r.get("cost_yuan", 0.0) for r in records), 4)
    by_model: dict[str, dict] = {}
    for r in records:
        m = r.get("model", "?")
        d = by_model.setdefault(m, {"calls": 0, "tokens": 0, "input": 0, "output": 0, "cost": 0.0})
        d["calls"] += 1
        d["tokens"] += r.get("total_tokens", 0)
        d["input"] += r.get("input_tokens", 0)
        d["output"] += r.get("output_tokens", 0)
        d["cost"] = round(d["cost"] + r.get("cost_yuan", 0.0), 4)
    return {
        "calls": len(records),
        "input_tokens": total_in,
        "output_tokens": total_out,
        "total_tokens": total,
        "cost_yuan": cost,
        "by_model": by_model,
    }


def add_usage(rec: UsageRecord) -> None:
    get_storage().set_obj(REC_NS, rec.id, rec.model_dump())


def list_usage_records(limit: int = 200) -> list[dict]:
    records = get_storage().list_objs(REC_NS)
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]


def local_stats() -> dict:
    records = get_storage().list_objs(REC_NS)
    return _sum_usage(records)


def live_overview() -> dict:
    """并行调用百炼 CLI 拉取各方统计"""
    cli = BailianCli(config.WORKSPACE_ID)
    plan = {
        "auth": ("auth_status", None),
        "usage_summary": ("usage_summary", None),
        "usage_stats": ("usage_stats", None),
        "usage_free": ("usage_free", None),
        "token_plan": ("usage_token_plan", None),
        "coding_plan": ("usage_coding_plan", None),
        "harness_official_tool": ("harness_quota", "official_tool"),
        "harness_infrastructure": ("harness_quota", "infrastructure"),
        "monitor_overview": ("monitor_overview", None),
    }

    def run(name, method, arg):
        try:
            f = getattr(cli, method)
            return f(arg) if arg else f()
        except Exception as e:
            return {"error": str(e)}

    out = {"workspace_id": config.WORKSPACE_ID}
    with ThreadPoolExecutor(max_workers=len(plan)) as ex:
        futures = {ex.submit(run, n, m, a): n for n, (m, a) in plan.items()}
        for fut in futures:
            out[futures[fut]] = fut.result()
    return out


def build_overview(force: bool = False) -> dict:
    """综合：本地累计 + 实时云端概览。

    缓存策略：默认读缓存为主。
      - 缓存存在且未满 30 分钟 → 直接返回缓存（不触达百炼 CLI）
      - 缓存存在但已超过 30 分钟 → 自动重新拉取一次
      - force=True（手动刷新）→ 总是重新拉取
    """
    s = get_storage()
    snap = s.get_snapshot(SNAP_NS, "overview")
    if snap and not force:
        age = time.time() - snap.get("captured_at_unix", 0)
        if age < CACHE_TTL:
            return snap
    local = local_stats()
    live = live_overview()
    ov = {
        "local": local,
        "live": live,
        "captured_at": datetime.now().isoformat(timespec="seconds"),
        "captured_at_unix": time.time(),
    }
    s.set_snapshot(SNAP_NS, "overview", ov)
    return ov
