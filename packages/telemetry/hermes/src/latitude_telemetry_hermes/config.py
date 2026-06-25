"""latitude — Hermes plugin that streams sessions to Latitude as OTLP traces.

Traces Hermes conversations, LLM calls, and tool usage to Latitude. One Hermes
turn becomes one trace: an ``interaction`` root span with an ``llm_request``
child per model call and a ``tool_execution`` child per tool call. Spans follow
Latitude's GenAI semantic conventions (``gen_ai.*``) so they render natively in
the Latitude trace viewer.

Activation is handled by the Hermes plugin system — this plugin only loads when
enabled via ``hermes plugins enable latitude``. At runtime it also
requires credentials; if they're missing the hooks are inert (fail-open: a
telemetry error never affects the agent).

Required env vars (set in your environment or ``~/.hermes/.env``):
  LATITUDE_API_KEY   - Latitude API key
  LATITUDE_PROJECT   - Latitude project slug (or LATITUDE_PROJECT_SLUG)

Optional env vars:
  LATITUDE_BASE_URL  - ingest endpoint (default: https://ingest.latitude.so)
  LATITUDE_NO_CONTENT - "true" to export structure/timing without prompts,
                        responses, or tool I/O
  LATITUDE_DEBUG     - "true" for verbose logging
"""

from __future__ import annotations

import logging
import os
import ssl
import threading
from typing import Any, Dict, Optional


def _ssl_context() -> ssl.SSLContext:
    """Verified TLS context, preferring certifi's CA bundle.

    Some Python installs (notably python.org builds on macOS) ship without a
    usable system CA store, so a plain ``urlopen`` to https can raise
    CERTIFICATE_VERIFY_FAILED. Hermes's HTTP stack already depends on certifi,
    so use it when available; otherwise fall back to the system default.
    """
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


_SSL_CONTEXT = _ssl_context()

logger = logging.getLogger(__name__)

SCOPE_NAME = "latitude-telemetry-hermes"
PKG_VERSION = "0.1.0"

# Bound on live trace state, so turns that never reach a clean finish
# (interrupted / tool-only final step) can't leak forever.
_MAX_RUNS = 256


# ─────────────────────────── config ────────────────────────────────────────


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


_CONFIG: Optional[Dict[str, Any]] = None
_CONFIG_LOCK = threading.Lock()


def _load_config() -> Dict[str, Any]:
    api_key = _env("LATITUDE_API_KEY")
    project = _env("LATITUDE_PROJECT") or _env("LATITUDE_PROJECT_SLUG")
    base_url = _env("LATITUDE_BASE_URL") or "https://ingest.latitude.so"
    enabled_flag = _env("LATITUDE_HERMES_TELEMETRY_ENABLED") or _env("LATITUDE_TELEMETRY_ENABLED")
    enabled = enabled_flag.lower() not in {"0", "false", "no"} if enabled_flag else True
    no_content = _env("LATITUDE_HERMES_NO_CONTENT") or _env("LATITUDE_NO_CONTENT")
    allow_content = no_content.lower() not in {"1", "true", "yes"} if no_content else True
    return {
        "api_key": api_key,
        "project": project,
        "base_url": base_url,
        "enabled": bool(enabled and api_key and project),
        "allow_content": allow_content,
        "debug": _env("LATITUDE_DEBUG").lower() in {"1", "true"},
    }


def _config() -> Dict[str, Any]:
    global _CONFIG
    if _CONFIG is None:
        with _CONFIG_LOCK:
            if _CONFIG is None:
                _CONFIG = _load_config()
    return _CONFIG


def _debug(message: str) -> None:
    if _config().get("debug"):
        logger.info("Latitude tracing: %s", message)
