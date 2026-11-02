"""存储工厂：redis 优先，连不上自动 fallback 文件"""
from pathlib import Path
from typing import Optional

from .. import config
from .base import Storage
from .file_store import FileStorage
from .redis_store import RedisStorage


def _make_redis() -> Optional[RedisStorage]:
    try:
        import redis

        client = redis.Redis.from_url(config.REDIS_URL, socket_connect_timeout=1)
        client.ping()
        return RedisStorage(client, prefix=config.REDIS_PREFIX)
    except Exception:
        return None


_storage: Optional[Storage] = None
_mode: str = "file"


def get_storage() -> Storage:
    global _storage, _mode
    if _storage is not None:
        return _storage
    r = _make_redis()
    if r is not None:
        _storage = r
        _mode = "redis"
    else:
        _storage = FileStorage(config.DATA_DIR)
        _mode = "file"
    return _storage


def storage_mode() -> str:
    get_storage()
    return _mode
