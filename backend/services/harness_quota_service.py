"""Harness 免费权益（Token Plan）监控

通过 bl token-plan harness-quota 查询各 Harness 服务（图像/代码/搜索/网页解析/
垂类/语音等）的月度免费权益额度与消耗情况。带内存缓存 + 手动刷新。

注：这些免费权益只有通过 MCP 通道调用对应服务才消耗；
工作台当前图像/联网搜索走 DashScope 模型 API（按量计费），不计入权益。
"""
import time

from ..adapters.bailian_cli import BailianCli
from . import cache_settings


_cache = {"ts": 0, "data": None}

_SERVICE_MAP = {
    "图像生成 MCP": "image",
    "视频生成 MCP": "video",
    "代码解释器 MCP": "code",
    "联网搜索增强版 MCP": "web_search",
    "网页解析 MCP": "web_parser",
    "垂类搜索 MCP": "vertical_search",
    "语音合成 MCP": "tts",
    "语音识别 MCP": "asr",
}


def _normalize(raw: dict) -> dict:
    items = []
    period_start = period_end = None
    total_quota = total_used = 0
    if isinstance(raw, dict) and raw.get("items"):
        for it in raw["items"]:
            used = it.get("usedQuota") or 0
            total = it.get("totalQuota") or 0
            total_used += used
            total_quota += total
            items.append({
                "service_id": _SERVICE_MAP.get(it.get("title"), it.get("title")),
                "title": it.get("title"),
                "unit": it.get("quotaUnit"),
                "total": total,
                "used": used,
                "available": it.get("availableQuota") or 0,
                "percent": round(used / total * 100, 1) if total else 0,
                "status": it.get("status"),
            })
            if it.get("instanceStartTime"):
                period_start = it.get("instanceStartTime")
            if it.get("instanceEndTime"):
                period_end = it.get("instanceEndTime")
    return {
        "total_quota": total_quota,
        "total_used": total_used,
        "period": {"start": period_start, "end": period_end},
        "items": items,
        "generated_at": int(time.time() * 1000),
    }


def get_quota(force: bool = False) -> dict:
    now = time.time()
    if force or not _cache["data"] or (now - _cache["ts"] >= cache_settings.ttl_seconds()):
        try:
            raw = BailianCli().harness_quota()
        except Exception:  # noqa: BLE001
            raw = {}
        _cache["data"] = _normalize(raw)
        _cache["ts"] = now
    return _cache["data"]
