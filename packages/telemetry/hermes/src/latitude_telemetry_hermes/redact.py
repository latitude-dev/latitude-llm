"""Two independent privacy controls.

`redact_deep` masks secret-shaped values *inside* content we still export,
using Hermes's own redactor. `attribute_matchers` blanks a whole attribute the
operator never wants to leave the machine, ported from the openclaw emitter.
"""

from __future__ import annotations

import logging
import re
import threading
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

from .config import REDACT_CACHE_MAX

logger = logging.getLogger(__name__)

_UNSET = object()

_REDACTOR: Any = _UNSET
_CACHE: Dict[str, str] = {}
_LOCK = threading.Lock()
_MATCHERS: Dict[Tuple[str, ...], Tuple[Callable[[str], bool], ...]] = {}


def _redactor() -> Optional[Callable[[str], str]]:
    global _REDACTOR
    if _REDACTOR is not _UNSET:
        return _REDACTOR
    with _LOCK:
        if _REDACTOR is _UNSET:
            _REDACTOR = _resolve_redactor()
    return _REDACTOR


def _resolve_redactor() -> Optional[Callable[[str], str]]:
    try:
        from agent.redact import redact_sensitive_text

        # force=True: a telemetry egress is exactly the safety boundary that must
        # never return raw secrets, whatever the user's logging preference is.
        return lambda text: redact_sensitive_text(text, force=True, redact_url_credentials=True)
    except Exception as exc:
        logger.warning("Latitude tracing: Hermes secret redactor unavailable (%s); exporting content unredacted", exc)
        return None


def available() -> bool:
    return _redactor() is not None


def redact_text(text: str) -> str:
    redactor = _redactor()
    if redactor is None or not text:
        return text
    cached = _CACHE.get(text)
    if cached is not None:
        return cached
    try:
        result = redactor(text)
    except Exception:
        return text
    with _LOCK:
        if len(_CACHE) >= REDACT_CACHE_MAX:
            _CACHE.clear()
        _CACHE[text] = result
    return result


def redact_deep(value: Any) -> Any:
    """Redact every string inside a nested attribute value, rebuilding as we go
    so the agent's own objects are never mutated."""
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {key: redact_deep(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_deep(item) for item in value]
    return value


def attribute_matchers(patterns: Sequence[str]) -> Tuple[Callable[[str], bool], ...]:
    key = tuple(patterns)
    cached = _MATCHERS.get(key)
    if cached is not None:
        return cached
    matchers = tuple(m for m in (_matcher(p) for p in patterns if p) if m is not None)
    _MATCHERS[key] = matchers
    return matchers


def _matcher(pattern: str) -> Optional[Callable[[str], bool]]:
    if pattern.startswith("/") and pattern.rfind("/") > 0:
        end = pattern.rfind("/")
        flags = 0
        for flag in pattern[end + 1 :]:
            flags |= {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL}.get(flag, 0)
        try:
            regex = re.compile(pattern[1:end], flags)
        except re.error:
            return None
        return lambda key: bool(regex.search(key))
    try:
        regex = re.compile(pattern)
    except re.error:
        # An unparseable pattern degrades to an exact key match rather than
        # dropping the user's redaction request on the floor.
        return lambda key: key == pattern
    return lambda key: key == pattern or bool(regex.search(key))


def matches(key: str, matchers: Sequence[Callable[[str], bool]]) -> bool:
    return any(match(key) for match in matchers)


def _reset_for_tests() -> None:
    global _REDACTOR
    _REDACTOR = _UNSET
    _CACHE.clear()
    _MATCHERS.clear()
