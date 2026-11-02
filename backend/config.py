"""全局配置"""
import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 数据目录（本地存储落盘位置）
DATA_DIR = Path(os.environ.get("TPH_DATA_DIR", BASE_DIR / "data"))

# Redis 连接；无 redis 时自动 fallback 到文件存储
REDIS_URL = os.environ.get("TPH_REDIS_URL", "redis://localhost:6379/0")
REDIS_PREFIX = "tph"

# 百炼 CLI 配置（含 api_key）
BAILIAN_CONFIG = Path(
    os.environ.get("BAILIAN_CONFIG", "~/.bailian/config.json")
).expanduser()

# 默认业务空间
WORKSPACE_ID = os.environ.get("BAILIAN_WORKSPACE_ID", "")

# DashScope OpenAI 兼容推理地址
DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

# 常用模型清单（试画时可选）
DEFAULT_MODELS = [
    "qwen-plus", "qwen-turbo", "qwen-max", "qwen-long",
    "qwen-vl-plus", "qwen-vl-max", "deepseek-v3", "deepseek-r1",
]
