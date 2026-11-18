"""全局配置（支持多 Provider：阿里云百炼 / 智谱GLM / OpenAI / DeepSeek / Kimi）

- 从项目根 .env 读取敏感配置（各平台 API Key、workspace 等）
- PROVIDERS 注册表定义了各平台的接入信息
"""
import os
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """极简 .env 加载器（零第三方依赖）：KEY=VALUE 写入 os.environ，不覆盖已存在的变量。"""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent
_load_dotenv(BASE_DIR / ".env")

# 数据目录（本地存储落盘位置）
DATA_DIR = Path(os.environ.get("TPH_DATA_DIR", BASE_DIR / "data"))

# Redis 连接；无 redis 时自动 fallback 到文件存储
REDIS_URL = os.environ.get("TPH_REDIS_URL", "redis://localhost:6379/0")
REDIS_PREFIX = "tph"

# 百炼 CLI 配置（含 api_key）
BAILIAN_CONFIG = Path(
    os.environ.get("BAILIAN_CONFIG", "~/.bailian/config.json")
).expanduser()

# 默认业务空间（阿里云百炼）；在 .env 配置 BAILIAN_WORKSPACE_ID，勿硬编码真实值
WORKSPACE_ID = os.environ.get("BAILIAN_WORKSPACE_ID", "")

# 智谱 GLM Code Plan 专用 Key（bigmodel.cn，用于查 Code Plan 用量；一般不同于 ZHIPU_API_KEY）
ZHIPU_TOKENPLAN_API_KEY = os.environ.get("ZHIPU_TOKENPLAN_API_KEY", "")

# DashScope OpenAI 兼容推理地址
DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


# ---------- 多 Provider 注册表 ----------
# kind: quota  = 有配额/订阅可监控（百炼 token-plan/harness、智谱 code plan）
#       general = 通用 OpenAI 兼容 Key（OpenAI/DeepSeek/Kimi），仅 Key 管理 + 试画 + 本地用量
# desc: 平台优势介绍（试画页预览卡片用）；score: 推荐分 0~5（0.1 步进）
PROVIDERS: dict[str, dict] = {
    "aliyun": {
        "name": "阿里云百炼",
        "kind": "quota",
        "base_url": DASHSCOPE_BASE_URL,
        "env_key": "BAILIAN_API_KEY",
        "desc": "支持配置百炼 API Key；Token Plan 配额查询需要对应控制台授权",
        "score": 4.8,
        "default_models": [
            "qwen-plus", "qwen-turbo", "qwen-max", "qwen-long",
            "qwen-vl-plus", "qwen-vl-max", "deepseek-v3", "deepseek-r1",
        ],
    },
    "zhipu": {
        "name": "智谱 GLM (z.ai)",
        "kind": "quota",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "env_key": "ZHIPU_API_KEY",
        "desc": "可配置智谱模型调用与 Code Plan 配额查询，权限分别管理",
        "score": 4.6,
        "default_models": ["glm-5.3", "glm-5.3-flash"],
    },
    "openai": {
        "name": "OpenAI",
        "kind": "general",
        "base_url": "https://api.openai.com/v1",
        "env_key": "OPENAI_API_KEY",
        "desc": "使用自有 OpenAI API Key 进行模型体验；与 Codex 订阅额度分开统计",
        "score": 4.5,
        "default_models": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
    },
    "deepseek": {
        "name": "DeepSeek",
        "kind": "general",
        "base_url": "https://api.deepseek.com/v1",
        "env_key": "DEEPSEEK_API_KEY",
        "desc": "使用自有 DeepSeek API Key 进行文本对话与推理体验",
        "score": 4.3,
        "default_models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "kimi": {
        "name": "Kimi (Moonshot)",
        "kind": "general",
        "base_url": "https://api.moonshot.cn/v1",
        "env_key": "KIMI_API_KEY",
        "desc": "使用 Moonshot API Key 进行模型体验；与 Kimi 会员额度分开统计",
        "score": 4.2,
        "default_models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2"],
    },
}

# 试画默认模型合集（聚合各 provider 的 default_models）
DEFAULT_MODELS: list[str] = []
for _p in PROVIDERS.values():
    for _m in _p["default_models"]:
        if _m not in DEFAULT_MODELS:
            DEFAULT_MODELS.append(_m)


def provider_env_value(pid: str) -> str:
    """取某 provider 在 .env / 环境变量中配置的 API Key（未配置返回空串）。"""
    meta = PROVIDERS.get(pid) or {}
    ek = meta.get("env_key")
    return os.environ.get(ek, "") if ek else ""


def provider_name(pid: str) -> str:
    return (PROVIDERS.get(pid) or {}).get("name", pid)

# Membership records can be managed without an API key; querying capability is separate.
for _id, _name, _env, _url in [
    ("codex", "Codex 会员", "", ""),
    ("grok", "Grok / xAI", "XAI_API_KEY", "https://api.x.ai/v1"),
    ("gemini", "Gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai"),
    ("claude", "Claude", "ANTHROPIC_API_KEY", "https://api.anthropic.com")]:
    PROVIDERS[_id] = {"name": _name, "kind": "general", "env_key": _env,
                      "base_url": _url, "default_models": [],
                      "desc": "支持多个账号；会员配额可手工记录，API Key 与会员额度分别管理。"}
