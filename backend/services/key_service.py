"""Key 管理服务：增删改查 + 从百炼配置/ .env 自动导入各 Provider 的默认 key"""
from . import cache_settings

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
    """从环境变量一次性初始化账号；页面修改、删除后不覆盖或复活。

    支持 PROVIDER_API_KEY_2 等编号槽位，不再隐式导入本机 CLI 凭证。
    """
    s = get_storage()
    # 0) 数据迁移：为旧数据中缺 provider 的 Key 补默认平台（aliyun）
    for k in s.list_objs(NS):
        if not k.get("provider"):
            k["provider"] = "aliyun"
            s.set_obj(NS, k["id"], k)

    # Environment seeds are imported once. UI edits and deletions survive restarts.
    import re
    slots = []
    for pid, meta in config.PROVIDERS.items():
        prefix = meta.get("env_key")
        if not prefix:
            continue
        for env_name in sorted(os.environ):
            if env_name == prefix or re.fullmatch(re.escape(prefix) + r"_[1-9][0-9]*", env_name):
                slots.append((env_name, pid, "general" if meta["kind"] == "general" else "dashscope"))
    for prefix, pid, kind in [("BAILIAN_TOKENPLAN_API_KEY", "aliyun", "token_plan"),
                              ("ZHIPU_TOKENPLAN_API_KEY", "zhipu", "code_plan"),
                              ("XAI_MANAGEMENT_KEY", "grok", "management")]:
        for env_name in sorted(os.environ):
            if env_name == prefix or re.fullmatch(prefix + r"_[1-9][0-9]*", env_name):
                slots.append((env_name, pid, kind))
    for env_name, pid, kind in slots:
        value = os.environ.get(env_name, "").strip()
        if not value or s.get_snapshot("env_import", env_name):
            continue
        meta = config.PROVIDERS[pid]
        keys = s.list_objs(NS)
        match = next((k for k in keys if k.get("provider") == pid and k.get("api_key") == value and k.get("kind") == kind), None)
        # Adopt legacy env imports rather than overwriting their manually edited values.
        if not match and env_name == meta.get("env_key"):
            match = next((k for k in keys if k.get("provider") == pid and "env" in k.get("note", "")), None)
        if not match:
            match = create_key({"provider": pid, "kind": kind, "api_key": value,
                "name": os.environ.get(env_name + "_NAME") or f"{meta['name']} · {env_name}",
                "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1" if kind == "token_plan" else meta.get("base_url"),
                "workspace_id": os.environ.get(env_name + "_TEAM_ID") or (os.environ.get("XAI_TEAM_ID") if env_name == "XAI_MANAGEMENT_KEY" else None),
                "models": meta.get("default_models", []), "source": env_name, "note": "从 .env 初始化，可在页面修改"})
        stored = s.get_obj(NS, match["id"])
        stored.setdefault("source", env_name)
        s.set_obj(NS, match["id"], stored)
        s.set_snapshot("env_import", env_name, {"id": match["id"]})
    _invalidate_list_cache(s)


def list_keys(show_secret: bool = False, force: bool = False) -> list[dict]:
    s = get_storage()
    # 默认读缓存，手动刷新(force) 或写操作后失效
    if not show_secret and not force:
        snap = s.get_snapshot(NS, _LIST_CACHE_KEY)
        if snap and time.time() - snap.get("_t", 0) < cache_settings.ttl_seconds():
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
    _validate_account(data)
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
        trial_only=data.get("trial_only", False),
        used_percent=data.get("used_percent"), resets_at=data.get("resets_at"), source=data.get("source", "manual"),
        status=data.get("status", "active"),
        expire_at=data.get("expire_at"),
        created_at=data.get("created_at") or now,
        updated_at=now,
    )
    get_storage().set_obj(NS, item.id, item.model_dump())
    _sync_bailian(item)
    _invalidate_list_cache(get_storage())
    return item.masked()


def update_key(key_id: str, patch: dict) -> Optional[dict]:
    s = get_storage()
    obj = s.get_obj(NS, key_id)
    if not obj:
        return None
    if not patch.get("api_key") or "*" in str(patch.get("api_key", "")):
        patch = {k: v for k, v in patch.items() if k != "api_key"}
    if patch.get("provider", obj["provider"]) != obj["provider"] and patch.get("kind", obj["kind"]) != "manual" and "api_key" not in patch:
        raise ValueError("切换平台时请填写新平台的密钥")
    _validate_account({**obj, **patch})
    item = KeyItem.model_validate(obj)
    for f in ["provider", "name", "kind", "api_key", "base_url", "workspace_id",
              "models", "note", "status", "expire_at", "used_percent", "resets_at", "trial_only"]:
        if f in patch and (patch[f] is not None or f in ("expire_at", "used_percent", "resets_at", "base_url", "workspace_id")):
            setattr(item, f, patch[f])
    item = KeyItem.model_validate(item.model_dump())
    item.updated_at = _now()
    s.set_obj(NS, key_id, item.model_dump())
    _sync_bailian(item, old=obj)
    _invalidate_list_cache(s)
    return item.masked()


def delete_key(key_id: str) -> bool:
    s = get_storage()
    if not s.get_obj(NS, key_id):
        return False
    s.delete_obj(NS, key_id)
    _invalidate_list_cache(s)
    return True


def _validate_account(data):
    if data.get("provider", "aliyun") not in config.PROVIDERS:
        raise ValueError("请选择支持的平台")
    if not str(data.get("name", "")).strip():
        raise ValueError("请填写账号名称")
    if data.get("status", "active") not in ("active", "disabled", "expired"):
        raise ValueError("无效账号状态")
    if data.get("kind") == "management" and not data.get("workspace_id"):
        raise ValueError("请填写 xAI 团队 ID")
    if data.get("kind") != "manual" and not str(data.get("api_key", "")).strip():
        raise ValueError("请填写 API Key，或选择会员手工记录")
    for field in ("expire_at", "resets_at"):
        if data.get(field):
            try:
                datetime.fromisoformat(data[field].replace("Z", "+00:00"))
            except (TypeError, ValueError):
                raise ValueError("日期格式无效")


def _sync_bailian(item, old=None):
    from . import bailian_accounts
    store = get_storage()
    account = store.get_obj(bailian_accounts.NS, item.id)
    if item.provider != "aliyun" or item.kind != "token_plan":
        if account:
            store.delete_obj(bailian_accounts.NS, item.id)
        return
    if not account:
        bailian_accounts.register(item.id, item.name, {"api_key": item.api_key,
            "base_url": "https://token-plan.cn-beijing.maas.aliyuncs.com",
            "console_site": "domestic", "console_region": "cn-beijing"})
    else:
        account["label"] = item.name
        store.set_obj(bailian_accounts.NS, item.id, account)
        if old and (old.get("api_key") != item.api_key or old.get("workspace_id") != item.workspace_id):
            # A different key/workspace is a different identity; never reuse console credentials.
            path = bailian_accounts.config_dir(item.id) / "config.json"
            path.write_text(json.dumps({"api_key": item.api_key, "workspace_id": item.workspace_id,
                "console_site": "domestic", "console_region": "cn-beijing", "active_config": "default"}))
            path.chmod(0o600)
