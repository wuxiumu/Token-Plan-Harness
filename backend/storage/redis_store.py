"""Redis 存储实现"""
import json
from typing import Any, Optional

from .base import Storage, _dumps


class RedisStorage(Storage):
    def __init__(self, redis_client, prefix: str = "tph"):
        self.r = redis_client
        self.prefix = prefix

    def _obj_key(self, ns: str, obj_id: str) -> str:
        return f"{self.prefix}:obj:{ns}:{obj_id}"

    def _idx_key(self, ns: str) -> str:
        return f"{self.prefix}:idx:{ns}"

    def _snap_key(self, ns: str, name: str) -> str:
        return f"{self.prefix}:snap:{ns}:{name}"

    # ---- 对象集合 ----
    def set_obj(self, ns, obj_id, obj, ttl=None):
        self.r.set(self._obj_key(ns, obj_id), _dumps(obj), ex=ttl)
        self.r.sadd(self._idx_key(ns), obj_id)

    def get_obj(self, ns, obj_id):
        raw = self.r.get(self._obj_key(ns, obj_id))
        if raw is None:
            return None
        return json.loads(raw)

    def delete_obj(self, ns, obj_id):
        self.r.delete(self._obj_key(ns, obj_id))
        self.r.srem(self._idx_key(ns), obj_id)

    def list_objs(self, ns):
        ids = self.r.smembers(self._idx_key(ns))
        out = []
        for oid in ids:
            if isinstance(oid, bytes):
                oid = oid.decode()
            raw = self.r.get(self._obj_key(ns, oid))
            if raw:
                try:
                    out.append(json.loads(raw))
                except Exception:
                    pass
        return out

    def count_objs(self, ns):
        return self.r.scard(self._idx_key(ns))

    # ---- 快照 ----
    def set_snapshot(self, ns, name, value, ttl=None):
        self.r.set(self._snap_key(ns, name), _dumps(value), ex=ttl)

    def get_snapshot(self, ns, name):
        raw = self.r.get(self._snap_key(ns, name))
        if raw is None:
            return None
        return json.loads(raw)

    def flush(self):
        keys = self.r.keys(f"{self.prefix}:*")
        if keys:
            self.r.delete(*keys)
