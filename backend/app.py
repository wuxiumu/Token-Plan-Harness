"""AI-Key 管理工作台 — FastAPI 入口

本地启动：bash run.sh  或  ./.venv/bin/uvicorn backend.app:app --port 8000
前端位于 frontend/，通过 /static 与根路径访问。
"""
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .services import access_service, key_service, stats_service, trial_service
from .storage import get_storage, storage_mode

app = FastAPI(title="AI-Key 管理工作台", version="0.1.0")

FRONTEND = config.BASE_DIR / "frontend"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 请求体模型 ----------
class KeyCreate(BaseModel):
    name: str
    api_key: str
    provider: str = "aliyun"
    kind: str = "dashscope"
    base_url: Optional[str] = None
    workspace_id: Optional[str] = None
    models: list[str] = []
    note: str = ""
    status: str = "active"
    expire_at: Optional[str] = None


class KeyPatch(BaseModel):
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


class ChatBody(BaseModel):
    key_id: str
    model: str
    messages: list[dict]
    max_tokens: Optional[int] = None


class AccessBody(BaseModel):
    view: str = ""
    url: str = ""


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
    return key_service.create_key(body.model_dump())


@app.get("/api/keys", tags=["keys"])
def api_list_keys(force: bool = False):
    return {"items": key_service.list_keys(force=force)}


@app.put("/api/keys/{key_id}", tags=["keys"])
def api_update_key(key_id: str, body: KeyPatch):
    item = key_service.update_key(key_id, body.model_dump(exclude_unset=True))
    if not item:
        raise HTTPException(404, "key not found")
    return item


@app.delete("/api/keys/{key_id}", tags=["keys"])
def api_delete_key(key_id: str):
    if not key_service.delete_key(key_id):
        raise HTTPException(404, "key not found")
    return {"ok": True}


# ---------- 统计 ----------
@app.get("/api/stats/overview", tags=["stats"])
def api_stats_overview(force: bool = False):
    return stats_service.build_overview(force=force)


@app.get("/api/stats/usage-records", tags=["stats"])
def api_usage_records(limit: int = 200):
    return {"items": stats_service.list_usage_records(limit), "total": stats_service.local_stats()}


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
    return {
        "ok": True,
        "storage_mode": storage_mode(),
        "workspace_id": config.WORKSPACE_ID,
        "data_dir": str(config.DATA_DIR),
    }


# ---------- 前端静态 ----------
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(FRONTEND / "index.html")


app.mount("/static", StaticFiles(directory=str(FRONTEND)), name="static")


@app.on_event("startup")
def _startup():
    key_service.bootstrap_default_key()
