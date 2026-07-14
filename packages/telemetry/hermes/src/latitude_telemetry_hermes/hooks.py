# ─────────────────────────── hook handlers ─────────────────────────────────
# Module-level wrappers: gated on config, fail-open so a telemetry error never
# affects the agent. The builder is a process-wide singleton.

from __future__ import annotations

from typing import Any

from .builder import _Builder
from .config import _config, _debug
from .transport import _flush, _ship

_BUILDER = _Builder()


def on_pre_api_request(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_pre_api_request(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"pre_api_request handler failed: {exc}")


def on_post_api_request(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_post_api_request(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"post_api_request handler failed: {exc}")


def on_pre_llm_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_pre_llm_call(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"pre_llm_call handler failed: {exc}")


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


def on_session_end(**kwargs: Any) -> None:
    """Ship any still-open run and block until the HTTP export finishes.

    Fires at the end of every run_conversation (including one-shot `-z` runs)
    and on session teardown. Without the flush the daemon export threads are
    killed when a short run exits and the trace is lost.
    """
    if not _config()["enabled"]:
        return
    try:
        session_id = kwargs.get("session_id") or ""
        task_id = kwargs.get("task_id") or ""
        for payload in _BUILDER.finish_scoped(session_id, task_id):
            _ship(payload)
    except Exception as exc:  # fail-open
        _debug(f"session_end handler failed: {exc}")
    finally:
        try:
            _flush()
        except Exception as exc:  # fail-open
            _debug(f"flush failed: {exc}")


def register(ctx: Any) -> None:
    """Entry point called by the Hermes plugin system.

    The two callback families fire at different times with different kwargs, so
    they bind to different builder methods: pre/post_api_request are the
    LLM-call span boundary (they carry request/response/usage/provider/model/
    api_request_id), while pre/post_llm_call frame the turn. on_session_end and
    on_session_finalize flush the exporter so short/one-shot runs still ship.
    """
    ctx.register_hook("pre_api_request", on_pre_api_request)
    ctx.register_hook("post_api_request", on_post_api_request)
    ctx.register_hook("pre_llm_call", on_pre_llm_call)
    ctx.register_hook("post_llm_call", on_post_llm_call)
    ctx.register_hook("pre_tool_call", on_pre_tool_call)
    ctx.register_hook("post_tool_call", on_post_tool_call)
    ctx.register_hook("on_session_end", on_session_end)
    ctx.register_hook("on_session_finalize", on_session_end)
