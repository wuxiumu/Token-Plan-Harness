"""Key 管理服务：增删改查 + 从百炼配置/ .env 自动导入各 Provider 的默认 key"""
import json
import os
import uuid
from datetime import datetime
from typing import Optional

from .. import config
from ..models import KeyItem
from ..storage import get_storage

NS = "key"


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

    # 2) 各 Provider 的 .env / 环境变量 Key
    for pid, meta in config.PROVIDERS.items():
        if pid == "aliyun":
            continue  # 百炼已在上一步处理（token-plan）；通用百炼 key 也可手动加
        val = config.provider_env_value(pid)
        if not val:
            continue
        if _exists(lambda k: k.get("provider") == pid and "env" in (k.get("note") or "")):
            continue
        kind = "general" if meta["kind"] == "general" else "dashscope"
        item = KeyItem(
            id=_new_id(),
            provider=pid,
            name=f"{meta['name']} 默认 Key",
            kind=kind,
            api_key=val,
            base_url=meta.get("base_url"),
            models=meta.get("default_models", []),
            note="从 .env 自动导入",
            created_at=_now(), updated_at=_now(),
        )
        s.set_obj(NS, item.id, item.model_dump())


def list_keys(show_secret: bool = False) -> list[dict]:
    s = get_storage()
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
    return out


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
    return item.masked()


def delete_key(key_id: str) -> bool:
    s = get_storage()
    if not s.get_obj(NS, key_id):
        return False
    s.delete_obj(NS, key_id)
    return True
