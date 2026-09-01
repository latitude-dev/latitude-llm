"""latitude — Hermes plugin that streams sessions to Latitude as OTLP traces.

Traces Hermes conversations, LLM calls, tool usage and memory operations to
Latitude. One Hermes turn becomes one trace: an ``interaction`` root span with
an ``llm_request`` child per model call, a ``tool_execution`` child per tool
call, and a ``gen_ai.memory.*`` child per memory read/write. Spans follow
Latitude's GenAI semantic conventions (``gen_ai.*``) so they render natively in
the Latitude trace viewer.

Activation is handled by the Hermes plugin system — this plugin only loads when
enabled via ``hermes plugins enable latitude``. At runtime it also requires
credentials; if they're missing the hooks are inert (fail-open: a telemetry
error never affects the agent).

Every setting is readable from two places, the environment winning: the env var
below, or ``plugins.entries.latitude.settings.<key>`` in the active profile's
``config.yaml``. Both ``config.yaml`` and ``.env`` are profile-scoped, so an
operator who gives each agent its own profile gets per-agent credentials, tags
and metadata for free. See ``docs/telemetry/hermes.md`` for the full table.

Required:
  LATITUDE_API_KEY (api_key)   - Latitude API key
  LATITUDE_PROJECT (project)   - Latitude project slug (or LATITUDE_PROJECT_SLUG)
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple


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
PKG_VERSION = "0.2.0"

DEFAULT_SERVICE_NAME = "hermes-agent"

# Bound on live trace state, so turns that never reach a clean finish
# (interrupted / tool-only final step) can't leak forever.
_MAX_RUNS = 256

# Bounds on the auxiliary registries that outlive a single run.
MAX_SESSIONS = 256
MAX_STREAM_WATCHES = 512
MAX_SUBAGENTS = 128

# Per-attribute content budget before middle-out truncation, and the export
# batch ceiling — the ingest cap is 32 MiB with no gzip decode, so payload size
# has to be controlled by construction.
DEFAULT_MAX_CONTENT_CHARS = 262_144
EXPORT_MAX_PAYLOAD_BYTES = 4 * 1024 * 1024
EXPORT_QUEUE_MAX = 512
EXPORT_MAX_ATTEMPTS = 3

# Same cap as the claude-code emitter: applied to a record body, never to the
# serialized array, so the attribute stays parseable JSON for the materializer.
MEMORY_RECORDS_CAP = 64 * 1024

REDACT_CACHE_MAX = 4_096
DEFAULT_REDACT_MASK = "******"

MAX_TAGS = 32
MAX_TAG_CHARS = 64
MAX_METADATA_KEYS = 64
MAX_METADATA_VALUE_CHARS = 1_024

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


# ─────────────────────────── config ────────────────────────────────────────

# Every key is resolvable from the environment or from the plugin's own
# `config.yaml` settings block; env wins. Aliases exist where an emitter-neutral
# LATITUDE_* name predates the hermes-scoped one.
_ENV_ALIASES: Dict[str, Tuple[str, ...]] = {
    "api_key": ("LATITUDE_API_KEY",),
    "project": ("LATITUDE_PROJECT", "LATITUDE_PROJECT_SLUG"),
    "base_url": ("LATITUDE_BASE_URL",),
    "enabled": ("LATITUDE_HERMES_TELEMETRY_ENABLED", "LATITUDE_TELEMETRY_ENABLED"),
    "no_content": ("LATITUDE_HERMES_NO_CONTENT", "LATITUDE_NO_CONTENT"),
    "debug": ("LATITUDE_DEBUG",),
    "memory": ("LATITUDE_HERMES_MEMORY",),
    "memory_content": ("LATITUDE_HERMES_MEMORY_CONTENT",),
    "redact_secrets": ("LATITUDE_HERMES_REDACT_SECRETS",),
    "redact_attributes": ("LATITUDE_HERMES_REDACT_ATTRIBUTES",),
    "redact_mask": ("LATITUDE_HERMES_REDACT_MASK",),
    "stream_ttft": ("LATITUDE_HERMES_STREAM_TTFT",),
    "tool_definitions": ("LATITUDE_HERMES_TOOL_DEFINITIONS",),
    "max_content_chars": ("LATITUDE_HERMES_MAX_CONTENT_CHARS",),
    "aux_usage": ("LATITUDE_HERMES_AUX_USAGE",),
    "tags": ("LATITUDE_HERMES_TAGS", "LATITUDE_TAGS"),
    "metadata": ("LATITUDE_HERMES_METADATA", "LATITUDE_METADATA"),
    "agent.name": ("LATITUDE_HERMES_AGENT_NAME",),
    "agent.version": ("LATITUDE_HERMES_AGENT_VERSION",),
    "service_name": ("LATITUDE_HERMES_SERVICE_NAME",),
    "inherit_context": ("LATITUDE_HERMES_INHERIT_CONTEXT",),
    "export_traceparent": ("LATITUDE_HERMES_EXPORT_TRACEPARENT",),
}

_CONFIG: Optional[Dict[str, Any]] = None
_CONFIG_LOCK = threading.Lock()
_SETTINGS: Optional[Callable[[str], Any]] = None
_PROFILE = ""
_WARNED: set = set()


def set_plugin_context(ctx: Any) -> None:
    """Capture the plugin facade at register() time, before any hook can fire."""
    global _SETTINGS, _PROFILE
    try:
        _SETTINGS = getattr(ctx, "get_config", None)
    except Exception:
        _SETTINGS = None
    try:
        _PROFILE = getattr(ctx, "profile_name", "") or ""
    except Exception:
        _PROFILE = ""
    reset_config()


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _setting(key: str) -> Any:
    """`plugins.entries.latitude.settings.<key>` from the profile's config.yaml."""
    if _SETTINGS is None:
        return None
    try:
        return _SETTINGS(key)
    except ValueError:  # a config path the facade refuses to expose
        return None
    except Exception:
        return None


def _raw(key: str) -> Any:
    for name in _ENV_ALIASES.get(key, ()):
        value = _env(name)
        if value:
            return value
    return _setting(key)


def _flag(key: str, default: bool) -> bool:
    value = _raw(key)
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    return default


def _text(key: str, default: str = "") -> str:
    value = _raw(key)
    if value is None:
        return default
    text = str(value).strip()
    return text or default


def _number(key: str, default: int) -> int:
    value = _raw(key)
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if value is None:
        return default
    try:
        return int(str(value).strip())
    except ValueError:
        _warn_once(key, f"ignoring non-numeric {key}={value!r}")
        return default


def _string_list(key: str) -> List[str]:
    value = _raw(key)
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    return [part.strip() for part in text.split(",") if part.strip()]


def _string_map(key: str) -> Dict[str, Any]:
    value = _raw(key)
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    text = str(value).strip()
    if not text:
        return {}
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
    out: Dict[str, Any] = {}
    for pair in text.split(","):
        name, sep, raw_value = pair.partition("=")
        if sep and name.strip():
            out[name.strip()] = raw_value.strip()
    return out


def _load_config() -> Dict[str, Any]:
    from .hermes import profile_name

    api_key = _text("api_key")
    project = _text("project")
    return {
        "api_key": api_key,
        "project": project,
        "base_url": _text("base_url", "https://ingest.latitude.so"),
        "enabled": bool(_flag("enabled", True) and api_key and project),
        "allow_content": not _flag("no_content", False),
        "debug": _flag("debug", False),
        "memory": _flag("memory", True),
        "memory_content": _flag("memory_content", True),
        "redact_secrets": _flag("redact_secrets", True),
        "redact_attributes": _string_list("redact_attributes"),
        "redact_mask": _text("redact_mask", DEFAULT_REDACT_MASK),
        "stream_ttft": _flag("stream_ttft", True),
        "tool_definitions": _flag("tool_definitions", True),
        "max_content_chars": max(1_024, _number("max_content_chars", DEFAULT_MAX_CONTENT_CHARS)),
        "aux_usage": _flag("aux_usage", True),
        "tags": _string_list("tags"),
        "metadata": _string_map("metadata"),
        "agent_name": _text("agent.name"),
        "agent_version": _text("agent.version"),
        "service_name": _text("service_name", DEFAULT_SERVICE_NAME),
        "inherit_context": _flag("inherit_context", True),
        # Off by default: it mutates process-wide os.environ, and Hermes runs each
        # turn on its own worker thread, so two concurrent tool calls would hand one
        # another's span to their children. child_env() is the safe path.
        "export_traceparent": _flag("export_traceparent", False),
        "profile": _PROFILE or profile_name(),
    }


def _config() -> Dict[str, Any]:
    global _CONFIG
    if _CONFIG is None:
        with _CONFIG_LOCK:
            if _CONFIG is None:
                _CONFIG = _load_config()
    return _CONFIG


def reset_config() -> None:
    """Drop the cached config so a credential added after import takes effect."""
    global _CONFIG
    with _CONFIG_LOCK:
        _CONFIG = None


def _debug(message: str) -> None:
    if _config().get("debug"):
        logger.info("Latitude tracing: %s", message)


def _warn_once(key: str, message: str) -> None:
    if key in _WARNED:
        return
    _WARNED.add(key)
    logger.warning("Latitude tracing: %s", message)
