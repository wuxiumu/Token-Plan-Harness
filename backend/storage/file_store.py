"""文件存储实现（redis 不可用时的 fallback）

每个 namespace 对应一个 JSON 文件：data/store/{ns}.json
结构: {"objects": {id: obj}, "snapshots": {name: value}}
"""
import json
import threading
from pathlib import Path
from typing import Any, Optional

from .base import Storage


class FileStorage(Storage):
    def __init__(self, data_dir: Path):
        self.store_dir = data_dir / "store"
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _path(self, ns: str) -> Path:
        # 防止 ns 逃逸路径
        safe = ns.replace("/", "_").replace("..", "_")
        return self.store_dir / f"{safe}.json"

    def _load(self, ns: str) -> dict:
        p = self._path(ns)
        if not p.exists():
            return {"objects": {}, "snapshots": {}}
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {"objects": {}, "snapshots": {}}

    def _save(self, ns: str, data: dict) -> None:
        p = self._path(ns)
        p.write_text(
            json.dumps(data, ensure_ascii=False, default=str, indent=2),
            encoding="utf-8",
        )

    # ---- 对象集合 ----
    def set_obj(self, ns, obj_id, obj, ttl=None):
        with self._lock:
            data = self._load(ns)
            data["objects"][obj_id] = obj
            self._save(ns, data)

    def get_obj(self, ns, obj_id):
        with self._lock:
            data = self._load(ns)
            return data["objects"].get(obj_id)

    def delete_obj(self, ns, obj_id):
        with self._lock:
            data = self._load(ns)
            data["objects"].pop(obj_id, None)
            self._save(ns, data)

    def list_objs(self, ns):
        with self._lock:
            data = self._load(ns)
            return list(data["objects"].values())

    def count_objs(self, ns):
        with self._lock:
            data = self._load(ns)
            return len(data["objects"])

    # ---- 快照 ----
    def set_snapshot(self, ns, name, value, ttl=None):
        with self._lock:
            data = self._load(ns)
            data["snapshots"][name] = value
            self._save(ns, data)

    def get_snapshot(self, ns, name):
        with self._lock:
            data = self._load(ns)
            return data["snapshots"].get(name)

    def flush(self):
        with self._lock:
            for p in self.store_dir.glob("*.json"):
                p.unlink(missing_ok=True)
