# ─────────────────────────── hook handlers ─────────────────────────────────
# Module-level wrappers: gated on config, fail-open so a telemetry error never
# affects the agent. The builder is a process-wide singleton.

from __future__ import annotations

from typing import Any

from .builder import _Builder
from .config import _config, _debug
from .transport import _ship

_BUILDER = _Builder()


def on_pre_llm_request(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_pre_llm_request(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"pre_llm_request handler failed: {exc}")


def on_post_llm_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_post_llm_call(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"post_llm_call handler failed: {exc}")


def on_pre_tool_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_pre_tool_call(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"pre_tool_call handler failed: {exc}")


def on_post_tool_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_post_tool_call(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"post_tool_call handler failed: {exc}")


def register(ctx: Any) -> None:
    """Entry point called by the Hermes plugin system.

    Registers for both hook-name variants so the plugin works across Hermes
    versions: pre/post_api_request fire per API call (preferred);
    pre/post_llm_call fire once per turn.
    """
    ctx.register_hook("pre_api_request", on_pre_llm_request)
    ctx.register_hook("post_api_request", on_post_llm_call)
    ctx.register_hook("pre_llm_call", on_pre_llm_request)
    ctx.register_hook("post_llm_call", on_post_llm_call)
    ctx.register_hook("pre_tool_call", on_pre_tool_call)
    ctx.register_hook("post_tool_call", on_post_tool_call)
