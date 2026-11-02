"""Key 管理服务：增删改查 + 从百炼配置/ .env 自动导入各 Provider 的默认 key"""
import json
import os
import time
import uuid
from datetime import datetime
from typing import Optional

from .. import config
from ..models import KeyItem
from ..storage import get_storage

NS = "key"
_LIST_CACHE_KEY = "__key_list"
_LIST_CACHE_TTL = 30  # 秒：Key 列表默认读缓存，手动刷新/写操作后强制更新


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _new_id() -> str:
    return uuid.uuid4().hex[:12]


def _exists(fn) -> bool:
    try:
        return any(fn(k) for k in get_storage().list_objs(NS))
    except Exception:
        return False


def read_bailian_tokenplan() -> Optional[dict]:
    """从 bl config 读取 token-plan 凭证与默认模型

    返回 {"api_key","base_url","models"}；base_url 为 OpenAI 兼容前缀。
    优先读 token-plan 配置节（本机默认），回退到顶层 api_key。
    """
    try:
        if not config.BAILIAN_CONFIG.exists():
            return None
        data = json.loads(config.BAILIAN_CONFIG.read_text(encoding="utf-8"))
        tp = data.get("token-plan") or {}
        api_key = tp.get("api_key") or data.get("api_key") or ""
        base = (tp.get("base_url") or config.DASHSCOPE_BASE_URL).rstrip("/")
        models = []
        for m in [tp.get("default_text_model"), tp.get("default_image_model"),
                  tp.get("default_speech_model"), tp.get("default_video_model"),
                  tp.get("default_image_to_video_model")]:
            if m and m not in models:
                models.append(m)
        for m in config.DEFAULT_MODELS:
            if m not in models:
                models.append(m)
        return {"api_key": api_key or None,
                "base_url": base + "/compatible-mode/v1" if "/v1" not in base else base,
                "models": models}
    except Exception:
        return None


def bootstrap_default_key() -> None:
    """启动时自动导入各 Provider 的默认 Key：

    - 阿里云百炼 token-plan（从 bl config）
    - 各 Provider 的 .env / 环境变量 Key（BAILIAN/ZHIPU/OPENAI/DEEPSEEK/KIMI）
    仅当对应类型的 key 尚未存在时导入，避免重复。
    """
    s = get_storage()
    # 0) 数据迁移：为旧数据中缺 provider 的 Key 补默认平台（aliyun）
    for k in s.list_objs(NS):
        if not k.get("provider"):
            k["provider"] = "aliyun"
            s.set_obj(NS, k["id"], k)

    # 1) 阿里云百炼 token-plan（从 bl config）
    if not _exists(lambda k: k.get("kind") == "token_plan"):
        info = read_bailian_tokenplan()
        if info and info.get("api_key"):
            item = KeyItem(
                id=_new_id(),
                provider="aliyun",
                name="百炼 Token Plan 默认 Key",
                kind="token_plan",
                api_key=info["api_key"],
                workspace_id=config.WORKSPACE_ID,
                base_url=info.get("base_url"),
                models=info.get("models", []),
                note="从 bl config(token-plan) 自动导入",
                created_at=_now(), updated_at=_now(),
            )
            s.set_obj(NS, item.id, item.model_dump())

    # 2) 各 Provider 的 .env / 环境变量 Key（含阿里云百炼通用 Key）
    for pid, meta in config.PROVIDERS.items():
        val = config.provider_env_value(pid)
        if not val:
            continue
        # 已有该平台 .env Key 时，仅同步最新模型清单（跟随 config），不重复导入
        existing = None
        for k in s.list_objs(NS):
            if k.get("provider") == pid and "env" in (k.get("note") or ""):
                existing = k
                break
        if existing:
            if existing.get("models") != meta.get("default_models", []):
                existing["models"] = meta.get("default_models", [])
                existing["updated_at"] = _now()
                s.set_obj(NS, existing["id"], existing)
            continue
        kind = "general" if meta["kind"] == "general" else "dashscope"
        name = "百炼通用 Key（全部服务）" if pid == "aliyun" else f"{meta['name']} 默认 Key"
        item = KeyItem(
            id=_new_id(),
            provider=pid,
            name=name,
            kind=kind,
            api_key=val,
            base_url=meta.get("base_url"),
            models=meta.get("default_models", []),
            note="从 .env 自动导入",
            created_at=_now(), updated_at=_now(),
        )
        s.set_obj(NS, item.id, item.model_dump())
    _invalidate_list_cache(s)


def list_keys(show_secret: bool = False, force: bool = False) -> list[dict]:
    s = get_storage()
    # 默认读缓存（30s），手动刷新(force) 或写操作后失效
    if not show_secret and not force:
        snap = s.get_snapshot(NS, _LIST_CACHE_KEY)
        if snap and time.time() - snap.get("_t", 0) < _LIST_CACHE_TTL:
            return snap["data"]
    keys = s.list_objs(NS)
    keys.sort(key=lambda k: k.get("created_at", ""), reverse=True)
    out = []
    for k in keys:
        if show_secret:
            out.append(k)
        else:
            k = dict(k)
            k["api_key"] = KeyItem.model_validate(k).masked()["api_key"]
            out.append(k)
    if not show_secret:
        s.set_snapshot(NS, _LIST_CACHE_KEY, {"_t": time.time(), "data": out})
    return out


def _invalidate_list_cache(s) -> None:
    """写操作后失效 Key 列表缓存，保证下次读取为最新。"""
    s.set_snapshot(NS, _LIST_CACHE_KEY, {"_t": 0, "data": []})


def get_key(key_id: str) -> Optional[dict]:
    s = get_storage()
    obj = s.get_obj(NS, key_id)
    if not obj:
        return None
    return obj


def get_key_with_secret(key_id: str) -> Optional[KeyItem]:
    s = get_storage()
    obj = s.get_obj(NS, key_id)
    if not obj:
        return None
    return KeyItem.model_validate(obj)


def create_key(data: dict) -> dict:
    now = _now()
    item = KeyItem(
        id=data.get("id") or _new_id(),
        provider=data.get("provider", "aliyun"),
        name=data.get("name") or "未命名 Key",
        kind=data.get("kind", "dashscope"),
        api_key=data.get("api_key", ""),
        base_url=data.get("base_url"),
        workspace_id=data.get("workspace_id"),
        models=data.get("models", []),
        note=data.get("note", ""),
        status=data.get("status", "active"),
        expire_at=data.get("expire_at"),
        created_at=data.get("created_at") or now,
        updated_at=now,
    )
    get_storage().set_obj(NS, item.id, item.model_dump())
    _invalidate_list_cache(get_storage())
    return item.masked()


def update_key(key_id: str, patch: dict) -> Optional[dict]:
    s = get_storage()
    obj = s.get_obj(NS, key_id)
    if not obj:
        return None
    item = KeyItem.model_validate(obj)
    for f in ["provider", "name", "kind", "api_key", "base_url", "workspace_id",
              "models", "note", "status", "expire_at"]:
        if f in patch and patch[f] is not None:
            setattr(item, f, patch[f])
    item.updated_at = _now()
    s.set_obj(NS, key_id, item.model_dump())
    _invalidate_list_cache(s)
    return item.masked()


def delete_key(key_id: str) -> bool:
    s = get_storage()
    if not s.get_obj(NS, key_id):
        return False
    s.delete_obj(NS, key_id)
    _invalidate_list_cache(s)
    return True
