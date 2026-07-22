"""Config for exporting Verifiers eval rollouts to Latitude.

Required env vars:
  LATITUDE_API_KEY   - Latitude API key
  LATITUDE_PROJECT   - Latitude project slug (or LATITUDE_PROJECT_SLUG)

Optional env vars:
  LATITUDE_BASE_URL       - ingest origin (default: https://ingest.latitude.so)
  LATITUDE_API_BASE_URL   - public API origin for scores (default: https://api.latitude.so)
  LATITUDE_NO_CONTENT     - "true" to export structure/timing without prompts/tool I/O
  LATITUDE_EXPORT_SCORES  - "true" (default) to POST reward/metrics as custom scores
  LATITUDE_DEBUG          - "true" for verbose logging
  LATITUDE_VERIFIERS_TELEMETRY_ENABLED / LATITUDE_TELEMETRY_ENABLED - master switch
"""

from __future__ import annotations

import logging
import os
import ssl
import threading
from typing import Any, Dict, Optional


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


_SSL_CONTEXT = _ssl_context()

logger = logging.getLogger(__name__)

SCOPE_NAME = "latitude-telemetry-verifiers"
PKG_VERSION = "0.1.0"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


_CONFIG: Optional[Dict[str, Any]] = None
_CONFIG_LOCK = threading.Lock()


def _load_config() -> Dict[str, Any]:
    api_key = _env("LATITUDE_API_KEY")
    project = _env("LATITUDE_PROJECT") or _env("LATITUDE_PROJECT_SLUG")
    base_url = _env("LATITUDE_BASE_URL") or "https://ingest.latitude.so"
    api_base_url = _env("LATITUDE_API_BASE_URL") or "https://api.latitude.so"
    enabled_flag = _env("LATITUDE_VERIFIERS_TELEMETRY_ENABLED") or _env("LATITUDE_TELEMETRY_ENABLED")
    enabled = enabled_flag.lower() not in {"0", "false", "no"} if enabled_flag else True
    no_content = _env("LATITUDE_VERIFIERS_NO_CONTENT") or _env("LATITUDE_NO_CONTENT")
    allow_content = no_content.lower() not in {"1", "true", "yes"} if no_content else True
    export_scores_flag = _env("LATITUDE_EXPORT_SCORES")
    export_scores = export_scores_flag.lower() not in {"0", "false", "no"} if export_scores_flag else True
    return {
        "api_key": api_key,
        "project": project,
        "base_url": base_url,
        "api_base_url": api_base_url,
        "enabled": bool(enabled and api_key and project),
        "allow_content": allow_content,
        "export_scores": export_scores,
        "debug": _env("LATITUDE_DEBUG").lower() in {"1", "true"},
    }


def _config() -> Dict[str, Any]:
    global _CONFIG
    if _CONFIG is None:
        with _CONFIG_LOCK:
            if _CONFIG is None:
                _CONFIG = _load_config()
    return _CONFIG


def _reset_config_for_tests() -> None:
    global _CONFIG
    with _CONFIG_LOCK:
        _CONFIG = None


def _debug(message: str) -> None:
    if _config().get("debug"):
        logger.info("Latitude verifiers telemetry: %s", message)
