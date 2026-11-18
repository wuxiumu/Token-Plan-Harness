"""数据模型（pydantic v2）"""
from typing import Any, Optional
from pydantic import BaseModel, Field


class KeyItem(BaseModel):
    """一条 API Key（多 Provider：阿里云百炼 / 智谱 / OpenAI / DeepSeek / Kimi）"""

    id: str
    provider: str = "aliyun"   # 所属平台：aliyun | zhipu | openai | deepseek | kimi
    name: str
    kind: str = "dashscope"    # 平台内类型：dashscope | token_plan | harness | code_plan | general | other
    api_key: str = ""          # 明文，仅本地存储；对外返回时掩码
    base_url: Optional[str] = None
    workspace_id: Optional[str] = None
    models: list[str] = Field(default_factory=list)
    note: str = ""
    used_percent: Optional[float] = Field(default=None, ge=0, le=100)
    resets_at: Optional[str] = None
    source: str = "manual"
    trial_only: bool = False   # 仅用于模型体验，不加入首页和配额
    status: str = "active"     # active | disabled | expired
    expire_at: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

    def masked(self) -> dict:
        d = self.model_dump()
        d["api_key"] = mask_key(self.api_key)
        return d


class UsageRecord(BaseModel):
    """一次模型调用产生的用量记录（本地累计统计用）"""

    id: str
    key_id: str
    model: str
    kind: str = "chat"           # chat | image | video | speech | other
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_yuan: float = 0.0
    success: bool = True
    note: str = ""
    created_at: str = ""


class TrialRecord(BaseModel):
    """一次试画（多模型体验）记录"""

    id: str
    key_id: str
    model: str
    prompt: str
    response_preview: str = ""
    usage: Optional[dict] = None
    success: bool = True
    error: str = ""
    created_at: str = ""


def mask_key(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return k[:2] + "*" * (len(k) - 2)
    return k[:4] + "*" * 8 + k[-4:]
