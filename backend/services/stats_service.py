"""统计服务：实时拉取百炼用量/权益 + 本地累计用量聚合 + 智谱 Code Plan"""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Optional

import httpx

from .. import config
from ..adapters.bailian_cli import BailianCli
from ..models import UsageRecord
from ..storage import get_storage
from . import key_service, cache_settings, bailian_accounts

REC_NS = "usage_record"
SNAP_NS = "stats"


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


def live_overview(account_id=None) -> dict:
    """并行调用百炼 CLI 拉取各方统计"""
    account = bailian_accounts.resolve(account_id)
    credentials = bailian_accounts.credentials(account) if account else {}
    workspace = credentials.get("workspace_id") if account else config.WORKSPACE_ID
    account_usage = _sum_usage([r for r in get_storage().list_objs(REC_NS)
                                if account and r.get("key_id") == account["id"]])
    if account and not credentials.get("access_token"):
        api_only = account.get("quota_access") == "api_key_only"
        return {"account": account, "workspace_id": workspace, "local_usage": account_usage,
                "quota_status": "api_key_only" if api_only else "needs_console",
                "token_plan": {"error": "API Key 已保存；官方配额查询需要对应账号的控制台授权。"},
                "login_command": None if api_only else bailian_accounts.login_command(account)}
    cli = BailianCli(workspace, bailian_accounts.config_dir(account["id"]) if account else None)
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

    out = {"workspace_id": workspace, "account": account, "local_usage": account_usage}
    with ThreadPoolExecutor(max_workers=len(plan)) as ex:
        futures = {ex.submit(run, n, m, a): n for n, (m, a) in plan.items()}
        for fut in futures:
            out[futures[fut]] = fut.result()
    return out


def _provider_summary() -> dict:
    """各 Provider 的 Key 数量/类型/是否已配置 env，供概览 tab 展示。"""
    keys = key_service.list_keys(show_secret=False)
    out: dict = {}
    for pid, meta in config.PROVIDERS.items():
        ks = [k for k in keys if k.get("provider") == pid]
        out[pid] = {
            "name": meta["name"],
            "kind": meta["kind"],
            "key_count": len(ks),
            "kinds": sorted({k.get("kind", "") for k in ks}),
            "env_configured": bool(config.provider_env_value(pid)),
        }
    return out


# 智谱 Code Plan 用量监控端点（来自官方 glm-plan-usage 插件源码）
ZHIPU_USAGE_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit"
_ZHIPU_UNIT = {3: "每5小时", 6: "每周"}


def zhipu_code_plan(api_key=None) -> dict:
    """智谱 GLM Code Plan 订阅用量（真实拉取）。

    端点 GET {host}/api/monitor/usage/quota/limit，Authorization: Coding-Plan Key。
    返回每5小时 + 每周积分额度、已用/剩余/百分比/下次重置。
    """
    key = api_key if api_key is not None else config.ZHIPU_TOKENPLAN_API_KEY or config.provider_env_value("zhipu")
    if not key:
        return {
            "configured": False, "status": "not_configured",
            "level": None, "periods": [],
            "note": "在 .env 配置 ZHIPU_TOKENPLAN_API_KEY 后自动接入用量",
        }
    try:
        r = httpx.get(
            ZHIPU_USAGE_URL,
            headers={"Authorization": key, "Content-Type": "application/json",
                     "Accept-Language": "zh-CN,zh"},
            timeout=15,
        )
        if r.status_code != 200:
            return {"configured": True, "status": "error", "level": None, "periods": [],
                    "note": f"HTTP {r.status_code}: {r.text[:160]}"}
        body = r.json()
        data = body.get("data") or {}
        periods = []
        for it in data.get("limits", []):
            periods.append({
                "unit": _ZHIPU_UNIT.get(it.get("unit"), f"单位{it.get('unit')}"),
                "total": it.get("usage", 0),
                "used": it.get("currentValue", 0),
                "remaining": it.get("remaining", 0),
                "percentage": it.get("percentage", 0),
                "next_reset_ms": it.get("nextResetTime"),
            })
        return {
            "configured": True, "status": "ok",
            "level": data.get("level"),
            "periods": periods,
            "note": "",
        }
    except Exception as e:
        return {"configured": True, "status": "error", "level": None, "periods": [],
                "note": str(e)}


def quota_source(name: str, force: bool = False, account_id=None, cache_only=False) -> dict:
    """Read one quota source using the same snapshots as the overview."""
    if name not in ("live", "zhipu"):
        raise ValueError("unknown quota source")
    store = get_storage()
    account = bailian_accounts.resolve(account_id) if name == "live" else None
    key = bailian_accounts.cache_key(account) if name == "live" else "mod_" + name
    snap = store.get_snapshot(SNAP_NS, key)
    if cache_only:
        cached = cache_settings.cached_result(snap)
        return {'data': snap['data'] if snap else {}, **{k: v for k, v in cached.items() if k in ('updated_at', 'cached', 'cache_miss', 'expired', 'stale')}}

    def usable(data):
        if name == "live":
            plan = data.get("token_plan")
            return isinstance(plan, dict) and "error" not in plan and isinstance(plan.get("per1MonthPercentage"), (int, float))
        return data.get("status") == "ok"

    if not force and snap and time.time() - snap.get("_t", 0) < cache_settings.ttl_seconds():
        return {"data": snap["data"], "updated_at": snap["_t"], "cached": True, "stale": False}
    data = live_overview(account["id"] if account else None) if name == "live" else zhipu_code_plan()
    if not usable(data) and snap and usable(snap.get("data", {})):
        return {"data": snap["data"], "updated_at": snap["_t"], "cached": True, "stale": True}
    now = time.time()
    if usable(data):
        store.set_snapshot(SNAP_NS, key, {"_t": now, "data": data})
    return {"data": data, "updated_at": now, "cached": False, "stale": False}


def build_overview(force: bool = False, force_tabs: Optional[list[str]] = None) -> dict:
    """综合：本地累计 + 实时云端概览 + 各 Provider 汇总 + 智谱 Code Plan。

    缓存策略：默认读缓存为主（每模块独立缓存，时间由全局设置控制）。
      - force=True：全量强制重新拉取（概览页「刷新」）
      - force_tabs=[...]：只强制刷新指定模块（live / zhipu / local），其余走缓存
    """
    force_tabs = set(force_tabs or [])
    s = get_storage()

    def _mod(name: str, builder, key: str):
        forced = force or (name in force_tabs)
        if not forced:
            snap = s.get_snapshot(SNAP_NS, key)
            if snap and time.time() - snap.get("_t", 0) < cache_settings.ttl_seconds():
                return snap["data"]
        data = builder()
        s.set_snapshot(SNAP_NS, key, {"_t": time.time(), "data": data})
        return data

    local = _mod("local", local_stats, "mod_local")
    live = quota_source("live", force=force or "live" in force_tabs)["data"]
    zhipu = _mod("zhipu", zhipu_code_plan, "mod_zhipu")
    providers = _provider_summary()  # 读 Key 缓存现算，不单独缓存
    return {
        "local": local,
        "bailian_accounts": bailian_accounts.list_accounts(),
        "live": live,
        "providers": providers,
        "zhipu_code_plan": zhipu,
        "captured_at": datetime.now().isoformat(timespec="seconds"),
        "captured_at_unix": time.time(),
    }
