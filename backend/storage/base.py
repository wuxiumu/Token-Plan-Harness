"""存储抽象接口

统一提供"对象集合"与"快照"两类操作：
- 对象集合(ns)：以 id 为键存取结构化对象（key、用量记录、试画记录等）
- 快照(ns)：存取单个非对象数据（统计基线等）

实现：redis(优先) / 文件(fallback)，接口完全一致，可无缝切换。
"""
import json
from abc import ABC, abstractmethod
from typing import Any, Optional


class Storage(ABC):
    # ---- 对象集合 ----
    @abstractmethod
    def set_obj(self, ns: str, obj_id: str, obj: dict, ttl: Optional[int] = None) -> None: ...

    @abstractmethod
    def get_obj(self, ns: str, obj_id: str) -> Optional[dict]: ...

    @abstractmethod
    def delete_obj(self, ns: str, obj_id: str) -> None: ...

    @abstractmethod
    def list_objs(self, ns: str) -> list: ...

    @abstractmethod
    def count_objs(self, ns: str) -> int: ...

    # ---- 快照 ----
    @abstractmethod
    def set_snapshot(self, ns: str, name: str, value: Any, ttl: Optional[int] = None) -> None: ...

    @abstractmethod
    def get_snapshot(self, ns: str, name: str) -> Optional[Any]: ...

    # ---- 通用 ----
    @abstractmethod
    def flush(self) -> None: ...


def _dumps(o: Any) -> str:
    return json.dumps(o, ensure_ascii=False, default=str)
