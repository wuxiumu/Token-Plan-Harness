"""AI-Key 管理工作台 — FastAPI 入口

本地启动：bash run.sh  或  ./.venv/bin/uvicorn backend.app:app --port 8000
前端位于 frontend/，通过 /static 与根路径访问。
"""
from pathlib import Path
from typing import Optional
from datetime import datetime
import math
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .services import dashboard_service, share_service, bailian_accounts, cache_settings, codex_usage_service, grok_usage_service, kimi_usage_service, gemini_updates_service, kimi_updates_service, domain_monitor_service, access_service, harness_quota_service, key_service, mcp_log_service, mcp_service, stats_service, trial_service
from .storage import get_storage, storage_mode

app = FastAPI(title="AI-Key 管理工作台", version="0.1.0")

FRONTEND = config.BASE_DIR / "frontend"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_methods=["*"],
    allow_headers=["*"],
)


# LAN visitors only see the dedicated read-only projection, never admin APIs.
@app.middleware("http")
async def lan_readonly(request: Request, call_next):
    import ipaddress
    try:
        peer = ipaddress.ip_address(request.client.host)
        local = peer.is_loopback
    except (ValueError, AttributeError):
        local = False
    public = request.method in ("GET", "HEAD") and request.url.path in (
        "/share", "/share/", "/api/share/public")
    if not local and not public:
        if request.method in ("GET", "HEAD") and request.url.path == "/":
            return RedirectResponse('/share')
        return JSONResponse({"detail": "局域网仅提供只读分享页面；管理功能请在本机打开。"}, status_code=403)
    return await call_next(request)


@app.get("/share", include_in_schema=False)
@app.get("/share/", include_in_schema=False)
def share_page():
    return FileResponse(FRONTEND / 'share.html', headers={"Cache-Control": "no-store"})


@app.get("/api/share/public", tags=["share"])
def share_public():
    return share_service.public_snapshot()


@app.get("/api/share/info", tags=["share"])
def share_info(request: Request):
    return {"urls": share_service.links(request.url.port or 8000)}


@app.get("/api/share/qr", tags=["share"])
def share_qr(request: Request, url: str):
    if url not in share_service.links(request.url.port or 8000):
        raise HTTPException(400, "请选择本机的局域网分享地址")
    return Response(share_service.qr_svg(url), media_type='image/svg+xml', headers={"Cache-Control": "no-store"})


# ---------- 请求体模型 ----------
class KeyCreate(BaseModel):
    trial_only: bool = False
    name: str
    api_key: str = ""
    provider: str = "aliyun"
    kind: str = "dashscope"
    base_url: Optional[str] = None
    workspace_id: Optional[str] = None
    models: list[str] = []
    note: str = ""
    status: str = "active"
    expire_at: Optional[str] = None
    used_percent: Optional[float] = None
    resets_at: Optional[str] = None


class KeyPatch(BaseModel):
    trial_only: Optional[bool] = None
    name: Optional[str] = None
    api_key: Optional[str] = None
    provider: Optional[str] = None
    kind: Optional[str] = None
    base_url: Optional[str] = None
    workspace_id: Optional[str] = None
    models: Optional[list[str]] = None
    note: Optional[str] = None
    status: Optional[str] = None
    expire_at: Optional[str] = None
    used_percent: Optional[float] = None
    resets_at: Optional[str] = None


class CacheSettingsBody(BaseModel):
    minutes: int


class GrokSubscriptionBody(BaseModel):
    used_percent: float
    resets_at: Optional[datetime] = None


class GeminiQuotaBody(BaseModel):
    name: str
    used_percent: float
    resets_at: Optional[datetime] = None


class ChatBody(BaseModel):
    key_id: str
    model: str
    messages: list[dict]
    max_tokens: Optional[int] = None


class AccessBody(BaseModel):
    view: str = ""
    url: str = ""


class DomainMarkdownBody(BaseModel):
    markdown: str


@app.get("/api/domains", tags=["domains"])
def api_domains():
    return domain_monitor_service.get_config()


@app.put("/api/domains", tags=["domains"])
def api_update_domains(body: DomainMarkdownBody):
    try:
        return domain_monitor_service.save_config(body.markdown)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/domains/health", tags=["domains"])
def api_domain_health(force: bool = False):
    return domain_monitor_service.health(force)


# ---------- Key 管理 ----------
@app.get("/api/providers", tags=["keys"])
def api_providers():
    return {"providers": [
        {"id": pid, "name": meta["name"], "kind": meta["kind"],
         "base_url": meta["base_url"], "models": meta["default_models"],
         "desc": meta.get("desc", ""), "score": meta.get("score", 0.0)}
        for pid, meta in config.PROVIDERS.items()
    ]}


@app.post("/api/keys", tags=["keys"])
def api_create_key(body: KeyCreate):
    try:
        return key_service.create_key(body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/keys", tags=["keys"])
def api_list_keys(force: bool = False):
    return {"items": key_service.list_keys(force=force)}


@app.put("/api/keys/{key_id}", tags=["keys"])
def api_update_key(key_id: str, body: KeyPatch):
    try:
        item = key_service.update_key(key_id, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(400, "账号字段无效，请检查名称、类型、Key 和百分比") from exc
    if not item:
        raise HTTPException(404, "key not found")
    return item


@app.delete("/api/keys/{key_id}", tags=["keys"])
def api_delete_key(key_id: str):
    if not key_service.delete_key(key_id):
        raise HTTPException(404, "key not found")
    return {"ok": True}


class DashboardLayout(BaseModel):
    selected: list[str]


@app.get("/api/dashboard")
def dashboard_catalog():
    return dashboard_service.catalog()


@app.put("/api/dashboard")
def dashboard_layout(body: DashboardLayout):
    try:
        return dashboard_service.save_layout(body.selected)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/dashboard/module/{module_id}")
def dashboard_module(module_id: str, force: bool = False, cache_only: bool = False):
    try:
        return dashboard_service.summary(module_id, force, cache_only=cache_only and not force)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


# ---------- 统计 ----------
@app.get("/api/stats/overview", tags=["stats"])
def api_stats_overview(force: bool = False, force_tab: Optional[str] = None, force_tabs: Optional[str] = None):
    if force_tabs:
        tabs = [t.strip() for t in force_tabs.split(",") if t.strip()]
    else:
        tabs = [force_tab] if force_tab else None
    return stats_service.build_overview(force=force, force_tabs=tabs)


@app.get("/api/stats/usage-records", tags=["stats"])
def api_usage_records(limit: int = 200):
    return {"items": stats_service.list_usage_records(limit), "total": stats_service.local_stats()}


@app.get("/api/stats/codex", tags=["stats"])
def api_codex_usage(force: bool = False):
    return codex_usage_service.get_usage(force=force)


@app.get("/api/stats/quota/{source}", tags=["stats"])
def api_quota_source(source: str, force: bool = False, account_id: Optional[str] = None):
    if source not in ("live", "zhipu"):
        raise HTTPException(404, "未知配额来源")
    try:
        return stats_service.quota_source(source, force, account_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@app.get("/api/stats/bailian/accounts", tags=["stats"])
def api_bailian_accounts():
    return {"items": bailian_accounts.list_accounts()}


@app.get("/api/settings/cache", tags=["system"])
def api_get_cache_settings():
    return {"minutes": cache_settings.get_minutes()}


@app.put("/api/settings/cache", tags=["system"])
def api_set_cache_settings(body: CacheSettingsBody):
    try:
        cache_settings.set_minutes(body.minutes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"minutes": body.minutes}


@app.get("/api/stats/kimi", tags=["stats"])
def api_kimi_usage(force: bool = False):
    return kimi_usage_service.get_usage(force)


@app.get("/api/stats/grok", tags=["stats"])
def api_grok_usage(force: bool = False):
    return {"api": grok_usage_service.get_usage(force), "subscription": grok_usage_service.get_subscription()}


@app.put("/api/stats/grok/subscription", tags=["stats"])
def api_grok_subscription(body: GrokSubscriptionBody):
    if not math.isfinite(body.used_percent) or not 0 <= body.used_percent <= 100:
        raise HTTPException(400, "已用百分比须在 0 到 100 之间")
    if body.resets_at is not None and body.resets_at.utcoffset() is None:
        raise HTTPException(400, "重置时间须包含时区")
    return grok_usage_service.save_subscription(body.used_percent, body.resets_at.isoformat() if body.resets_at else None)


@app.get("/api/stats/gemini/updates", tags=["stats"])
def api_gemini_updates(force: bool = False):
    return gemini_updates_service.get_updates(force)


@app.get("/api/stats/kimi/updates", tags=["stats"])
def api_kimi_updates(force: bool = False):
    return kimi_updates_service.get_updates(force)


@app.get("/api/stats/gemini", tags=["stats"])
def api_gemini_list():
    items = get_storage().list_objs("gemini_quota")
    return {"items": sorted(items, key=lambda item: item.get("updated_at", 0), reverse=True)}


@app.post("/api/stats/gemini", tags=["stats"])
def api_gemini_create(body: GeminiQuotaBody):
    return _save_gemini(str(uuid.uuid4()), body)


@app.put("/api/stats/gemini/{item_id}", tags=["stats"])
def api_gemini_update(item_id: str, body: GeminiQuotaBody):
    if not get_storage().get_obj("gemini_quota", item_id):
        raise HTTPException(404, "记录不存在")
    return _save_gemini(item_id, body)


def _save_gemini(item_id: str, body: GeminiQuotaBody):
    name = body.name.strip()
    if not name or len(name) > 80:
        raise HTTPException(400, "名称须为 1 至 80 个字符")
    if not math.isfinite(body.used_percent) or not 0 <= body.used_percent <= 100:
        raise HTTPException(400, "已用百分比须在 0 到 100 之间")
    if body.resets_at is not None and body.resets_at.utcoffset() is None:
        raise HTTPException(400, "重置时间须包含时区")
    item = {"id": item_id, "name": name, "used_percent": body.used_percent,
            "resets_at": body.resets_at.isoformat() if body.resets_at else None,
            "updated_at": int(time.time()), "source": "manual"}
    get_storage().set_obj("gemini_quota", item_id, item)
    return item


@app.delete("/api/stats/gemini/{item_id}", tags=["stats"])
def api_gemini_delete(item_id: str):
    store = get_storage()
    if not store.get_obj("gemini_quota", item_id):
        raise HTTPException(404, "记录不存在")
    store.delete_obj("gemini_quota", item_id)
    return {"ok": True}


# ---------- 试画 ----------
@app.get("/api/trial/models", tags=["trial"])
def api_models():
    return {"models": trial_service.list_models()}


@app.post("/api/trial/chat", tags=["trial"])
def api_trial_chat(body: ChatBody):
    try:
        return trial_service.chat(body.key_id, body.model, body.messages, body.max_tokens)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/trial/records", tags=["trial"])
def api_trial_records(limit: int = 100):
    return {"items": trial_service.list_trials(limit)}


# ---------- Harness / MCP 服务测试中心 ----------
@app.get("/api/mcp/services", tags=["mcp"])
def api_mcp_services():
    return {"items": mcp_service.list_services()}


@app.post("/api/mcp/{service_id}", tags=["mcp"])
def api_mcp_call(service_id: str, body: dict = {}):
    return mcp_service.call(service_id, body)


@app.get("/api/mcp/logs", tags=["mcp"])
def api_mcp_logs(service_id: str = "", limit: int = 50):
    return {"items": mcp_log_service.list_logs(service_id or None, limit)}


@app.get("/api/mcp/stats", tags=["mcp"])
def api_mcp_stats(service_id: str = ""):
    return mcp_log_service.stats(service_id or None)


@app.get("/api/harness/quota", tags=["harness"])
def api_harness_quota(force: bool = False):
    return harness_quota_service.get_quota(force)


# ---------- 访问记录 ----------
@app.post("/api/access", tags=["access"])
def api_access_record(body: AccessBody):
    return access_service.record(view=body.view, url=body.url)


@app.get("/api/access/records", tags=["access"])
def api_access_records(limit: int = 50):
    return {"items": access_service.list_records(limit), "total": access_service.count()}


# ---------- 系统 ----------
@app.get("/api/health", tags=["system"])
def api_health():
    account = bailian_accounts.resolve()
    return {
        "ok": True,
        "storage_mode": storage_mode(),
        "primary_account": account,
        "workspace_id": bailian_accounts.credentials(account).get("workspace_id") if account else config.WORKSPACE_ID,
        "data_dir": str(config.DATA_DIR),
    }


# ---------- 前端静态 ----------
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(FRONTEND / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


@app.on_event("startup")
def _startup():
    key_service.bootstrap_default_key()
