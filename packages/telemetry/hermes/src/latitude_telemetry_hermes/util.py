from __future__ import annotations

import json
import os
import threading
import time
from typing import Any


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms_to_ns(ms: int) -> str:
    return str(int(ms) * 1_000_000)


def _trace_id() -> str:
    return os.urandom(16).hex()  # 32 hex chars


def _span_id() -> str:
    return os.urandom(8).hex()  # 16 hex chars


def _safe_json(value: Any) -> str:
    try:
        return value if isinstance(value, str) else json.dumps(value, default=str)
    except Exception:
        return ""


def _get(obj: Any, name: str) -> Any:
    """Read a field whether the payload is a dict or an object."""
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _trace_key(task_id: str, session_id: str, turn_id: str, api_request_id: str) -> str:
    """Stable per-turn scope key (mirrors Hermes's langfuse plugin)."""
    prefix = (
        f"task:{task_id}" if task_id else f"session:{session_id}" if session_id else f"thread:{threading.get_ident()}"
    )
    if turn_id:
        return f"{prefix}:turn:{turn_id}"
    if api_request_id:
        return f"{prefix}:api:{api_request_id}"
    return task_id or prefix
