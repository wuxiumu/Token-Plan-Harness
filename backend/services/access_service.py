"""访问记录服务：记录用户访问了哪些页面（视图/URL/时间），供工作台使用轨迹查看"""
import uuid
from datetime import datetime
from typing import Optional

from ..storage import get_storage

NS = "access"
MAX_KEEP = 200  # 最多保留条数，超出删最旧


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def record(view: str, url: str = "", ttl: Optional[int] = None) -> dict:
    """记录一次页面访问。view 为视图名（statistics/keys/trial 等）。"""
    s = get_storage()
    rec = {"id": _new_id(), "view": view or "", "url": url or "", "created_at": _now()}
    s.set_obj(NS, rec["id"], rec, ttl=ttl)
    # 超出容量，删最旧的
    items = s.list_objs(NS)
    if len(items) > MAX_KEEP:
        items.sort(key=lambda r: r.get("created_at", ""), reverse=True)
        for old in items[MAX_KEEP:]:
            try:
                s.delete_obj(NS, old["id"])
            except Exception:
                pass
    return rec


def list_records(limit: int = 50) -> list[dict]:
    s = get_storage()
    items = s.list_objs(NS)
    items.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return items[:limit]


def count() -> int:
    return get_storage().count_objs(NS)
