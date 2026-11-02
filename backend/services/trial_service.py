"""试画（多模型体验）服务：通过 DashScope OpenAI 兼容接口调用模型"""
import uuid
from datetime import datetime
from typing import Optional

import httpx

from .. import config
from ..models import TrialRecord, UsageRecord
from ..storage import get_storage
from . import key_service, stats_service

NS = "trial_record"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _nid() -> str:
    return uuid.uuid4().hex[:12]


def list_models() -> list[str]:
    keys = key_service.list_keys(show_secret=False)
    models = set(config.DEFAULT_MODELS)
    for k in keys:
        models.update(k.get("models", []))
    return sorted(models)


def _estimate_cost(model: str, in_tok: int, out_tok: int) -> float:
    """粗略价格估算（元/1K token），仅用于本地累计参考，非精确计费。
    价格默认按常见 qwen 档位近似；未知模型按 0 处理并在前端标注"估算"。
    """
    price_in = 0.0
    price_out = 0.0
    cheap = {"qwen-turbo", "deepseek-v3", "deepseek-r1"}
    mid = {"qwen-plus", "qwen-long", "qwen-vl-plus"}
    high = {"qwen-max", "qwen-vl-max", "qwen3-max"}
    if model in cheap:
        price_in, price_out = 0.0003, 0.0006
    elif model in mid:
        price_in, price_out = 0.0008, 0.002
    elif model in high:
        price_in, price_out = 0.0024, 0.0096
    return round((in_tok * price_in + out_tok * price_out) / 1000, 6)


def chat(
    key_id: str,
    model: str,
    messages: list[dict],
    max_tokens: Optional[int] = None,
) -> dict:
    key = key_service.get_key_with_secret(key_id)
    if not key:
        raise ValueError("key not found")
    if not key.api_key:
        raise ValueError("key has no api_key; add one first")

    base = (key.base_url or config.DASHSCOPE_BASE_URL).rstrip("/")
    url = base + "/chat/completions"
    payload: dict = {"model": model, "messages": messages}
    if max_tokens:
        payload["max_tokens"] = max_tokens
    headers = {"Authorization": f"Bearer {key.api_key}", "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=180) as c:
            resp = c.post(url, json=payload, headers=headers)
        data = resp.json()
        if resp.status_code != 200:
            raise RuntimeError(data.get("message") or data.get("error", {}).get("message") or resp.text[:300])
    except Exception as e:
        _save_trial(key_id, model, str(messages), "", None, False, str(e))
        return {"success": False, "error": str(e)}

    usage = data.get("usage", {})
    in_tok = usage.get("prompt_tokens", 0)
    out_tok = usage.get("completion_tokens", 0)
    total = in_tok + out_tok
    content = ""
    if data.get("choices"):
        content = data["choices"][0].get("message", {}).get("content", "") or ""
    cost = _estimate_cost(model, in_tok, out_tok)

    # 记录用量（本地累计统计）
    stats_service.add_usage(UsageRecord(
        id=_nid(), key_id=key_id, model=model, kind="chat",
        input_tokens=in_tok, output_tokens=out_tok, total_tokens=total,
        cost_yuan=cost, created_at=_now(),
    ))
    rec = _save_trial(key_id, model, str(messages), content, usage, True, "")
    return {
        "success": True,
        "response": content,
        "usage": usage,
        "cost_yuan": cost,
        "record_id": rec["id"],
    }


def _save_trial(key_id, model, prompt, response, usage, success, error) -> dict:
    rec = TrialRecord(
        id=_nid(), key_id=key_id, model=model, prompt=prompt,
        response_preview=response[:1000], usage=usage,
        success=success, error=error, created_at=_now(),
    )
    get_storage().set_obj(NS, rec.id, rec.model_dump())
    return rec.model_dump()


def list_trials(limit: int = 100) -> list[dict]:
    records = get_storage().list_objs(NS)
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records[:limit]
