"""Guarded bridges to Hermes internals.

Hook kwargs are the primary source; these helpers only cover what no hook
exposes. Each is isolated behind try/except with a working fallback, so a
Hermes refactor breaks one function rather than the plugin — the bundled
langfuse plugin imports `agent.usage_pricing` on the same terms.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import _debug

_UNSET = object()

_VERSION: Any = _UNSET
_TOOL_SNAPSHOT: Any = _UNSET


def hermes_version() -> Optional[str]:
    global _VERSION
    if _VERSION is _UNSET:
        _VERSION = _resolve_version()
    return _VERSION


def _resolve_version() -> Optional[str]:
    try:
        import hermes_cli

        version = getattr(hermes_cli, "__version__", None)
        if isinstance(version, str) and version:
            return version
    except Exception:  # not importable outside a Hermes install; the metadata lookup follows
        pass
    try:
        from importlib.metadata import version

        return version("hermes-agent")
    except Exception:
        return None


def profile_name() -> str:
    try:
        from hermes_cli.profiles import get_active_profile_name

        name = get_active_profile_name()
        if isinstance(name, str) and name:
            return name
    except Exception:  # profiles are optional; the default profile is the right answer
        pass
    return "default"


def hermes_home() -> Path:
    try:
        from hermes_constants import get_hermes_home

        return get_hermes_home()
    except Exception:
        return Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes"))


def memory_dir() -> Path:
    """Resolved through Hermes when possible: `get_memory_dir` is deliberately a
    function there, so a profile switch after import is still respected."""
    try:
        from tools.memory_tool import get_memory_dir

        return get_memory_dir()
    except Exception:
        return hermes_home() / "memories"


def state_db_path() -> Path:
    return hermes_home() / "state.db"


def hermes_config() -> Dict[str, Any]:
    try:
        from hermes_cli.config import load_config_readonly

        config = load_config_readonly()
        return config if isinstance(config, dict) else {}
    except Exception:
        return {}


def external_memory_provider() -> Optional[str]:
    """A configured provider means the built-in files are not the live store."""
    memory = hermes_config().get("memory")
    if not isinstance(memory, dict):
        return None
    provider = memory.get("provider")
    if not isinstance(provider, str):
        return None
    provider = provider.strip().lower()
    if not provider or provider in ("builtin", "built-in", "local", "default", "files", "none"):
        return None
    return provider


def tool_definitions_snapshot() -> Optional[List[Dict[str, Any]]]:
    global _TOOL_SNAPSHOT
    if _TOOL_SNAPSHOT is _UNSET:
        _TOOL_SNAPSHOT = _resolve_tool_snapshot()
    return _TOOL_SNAPSHOT


def _resolve_tool_snapshot() -> Optional[List[Dict[str, Any]]]:
    try:
        from model_tools import get_tool_definitions

        definitions = get_tool_definitions(quiet_mode=True)
        return definitions if isinstance(definitions, list) and definitions else None
    except Exception as exc:
        _debug(f"tool definition snapshot unavailable: {exc}")
        return None


def estimate_cost(model: str, usage: Dict[str, Any], provider: str, base_url: str) -> Optional[Dict[str, Any]]:
    """Hermes's own verdict on what a call cost, and under which billing route."""
    try:
        from agent.usage_pricing import CanonicalUsage, estimate_usage_cost, resolve_billing_route

        canonical = CanonicalUsage(
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
            cache_read_tokens=int(usage.get("cache_read_tokens") or 0),
            cache_write_tokens=int(usage.get("cache_write_tokens") or 0),
            reasoning_tokens=int(usage.get("reasoning_tokens") or 0),
        )
        result = estimate_usage_cost(model, canonical, provider=provider or None, base_url=base_url or None)
        route = resolve_billing_route(model, provider=provider or None, base_url=base_url or None)
        amount = getattr(result, "amount_usd", None)
        return {
            "amount": float(amount) if amount is not None else None,
            "status": getattr(result, "status", "") or "",
            "label": getattr(result, "label", "") or "",
            "billing_mode": getattr(route, "billing_mode", "") or "",
            "provider": getattr(route, "provider", "") or "",
        }
    except Exception as exc:
        _debug(f"cost estimation unavailable: {exc}")
        return None
