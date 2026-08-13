from __future__ import annotations

import json
import os
import time
from typing import Any


def _now_ms() -> int:
    return int(time.time() * 1000)


def _ms_to_ns(ms: int) -> str:
    return str(int(ms) * 1_000_000)


def _trace_id() -> str:
    return os.urandom(16).hex()


def _span_id() -> str:
    return os.urandom(8).hex()


def _safe_json(value: Any) -> str:
    try:
        return value if isinstance(value, str) else json.dumps(value, default=str)
    except Exception:
        return ""


def _get(obj: Any, name: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _sec_to_ms(value: Any, fallback: int | None = None) -> int:
    if isinstance(value, (int, float)) and value > 0:
        if value > 1e12:
            return int(value)
        return int(value * 1000)
    return fallback if fallback is not None else _now_ms()


def _normalize_trace_id(raw: Any) -> str:
    if isinstance(raw, str):
        cleaned = raw.replace("-", "").lower()
        if len(cleaned) == 32 and all(c in "0123456789abcdef" for c in cleaned):
            return cleaned
    return _trace_id()
