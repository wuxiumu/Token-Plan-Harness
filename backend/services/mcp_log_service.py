"""Harness / MCP 服务测试调用日志

记录每次调用的输入参数、输出、耗时与成功/失败状态。
redis 优先 / 文件兜底（与项目一致）；保留最近 MAX_KEEP 条。
"""
import time
import uuid

from ..storage import get_storage

NS = "mcp_log"
MAX_KEEP = 100


def add_log(service_id: str, name: str, params: dict, output, elapsed_ms: float, ok: bool) -> dict:
    st = get_storage()
    rec = {
        "id": f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "service_id": service_id,
        "name": name,
        "params": params or {},
        "output": output,
        "elapsed_ms": int(elapsed_ms),
        "ok": bool(ok),
        "created_at": int(time.time() * 1000),
    }
    st.set_obj(NS, rec["id"], rec)
    # 裁剪：保留最新的 MAX_KEEP 条
    all_objs = st.list_objs(NS)
    if len(all_objs) > MAX_KEEP:
        by_time = sorted(all_objs, key=lambda r: r.get("created_at", 0) or 0)
        for r in by_time[: len(all_objs) - MAX_KEEP]:
            st.delete_obj(NS, r["id"])
    return rec


def list_logs(service_id: str = None, limit: int = 50) -> list:
    st = get_storage()
    objs = st.list_objs(NS)
    if service_id:
        objs = [o for o in objs if o.get("service_id") == service_id]
    objs.sort(key=lambda r: r.get("created_at", 0) or 0, reverse=True)
    return objs[:limit]
