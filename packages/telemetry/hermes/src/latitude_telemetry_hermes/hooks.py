# ─────────────────────────── hook handlers ─────────────────────────────────
# Module-level wrappers: gated on config, fail-open so a telemetry error never
# affects the agent. The builder is a process-wide singleton.

from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, Optional

from .aux_usage import aux_spans
from .builder import _Builder
from .config import _config, _debug, reset_config, set_plugin_context
from .propagation import (
    LATITUDE_TRACEPARENT_VAR,
    PROJECT_VAR,
    SESSION_VAR,
    TRACEPARENT_VAR,
    ChildContext,
    set_active,
)
from .transport import _flush, _ship

_BUILDER = _Builder()

# on_session_end is a per-turn event on the user's critical path; finalize is
# teardown. atexit (in transport) is the one-shot safety net.
_TURN_FLUSH_SECONDS = 2.0
_TEARDOWN_FLUSH_SECONDS = 10.0


def on_pre_api_request(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_pre_api_request(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"pre_api_request handler failed: {exc}")


def on_post_api_request(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_post_api_request(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"post_api_request handler failed: {exc}")


def on_api_request_error(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_api_request_error(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"api_request_error handler failed: {exc}")


def on_pre_llm_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.on_pre_llm_call(**kwargs))
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
    try:
        _publish_child_context(kwargs)
    except Exception as exc:  # fail-open
        _debug(f"publishing child context failed: {exc}")


def on_post_tool_call(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _retract_child_context()
    except Exception as exc:  # fail-open
        _debug(f"retracting child context failed: {exc}")
    try:
        _ship(_BUILDER.on_post_tool_call(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"post_tool_call handler failed: {exc}")


def on_stream_start(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_stream_start(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"stream_start handler failed: {exc}")


def on_stream_delta(**kwargs: Any) -> None:
    """Hermes builds and enqueues a payload per delta once any callback is
    registered, so this stays O(1) and is skippable with LATITUDE_HERMES_STREAM_TTFT=0."""
    try:
        _BUILDER.on_stream_delta(**kwargs)
    except Exception:  # fail-open, and silent: this runs per token
        pass


def on_stream_end(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_stream_end(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"stream_end handler failed: {exc}")


def on_session_start(**kwargs: Any) -> None:
    """A new session re-reads the config, so a credential added to ~/.hermes/.env
    after import takes effect without restarting the process."""
    reset_config()
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_session_start(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"session_start handler failed: {exc}")


def on_session_reset(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_session_reset(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"session_reset handler failed: {exc}")


def on_session_end(**kwargs: Any) -> None:
    """Fires at the end of every turn (including one-shot `-z` runs).

    Ships whatever the turn left open. Spans are shipped as they close, so the
    queue is normally empty here and the flush costs nothing.
    """
    if not _config()["enabled"]:
        return
    try:
        _ship(_BUILDER.finish_scoped(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"session_end handler failed: {exc}")
    finally:
        try:
            _flush(_TURN_FLUSH_SECONDS)
        except Exception as exc:  # fail-open
            _debug(f"flush failed: {exc}")


def on_session_finalize(**kwargs: Any) -> None:
    """Session teardown: ship what is open, reconcile the auxiliary LLM calls
    Hermes only records in its own ledger, then wait for delivery."""
    if not _config()["enabled"]:
        return
    session_id = kwargs.get("session_id") or ""
    deadline = time.monotonic() + _TEARDOWN_FLUSH_SECONDS
    try:
        _ship(_BUILDER.finish_scoped(**kwargs))
    except Exception as exc:  # fail-open
        _debug(f"session_finalize handler failed: {exc}")
    try:
        _ship(_aux_usage(session_id, deadline))
    except Exception as exc:  # fail-open
        _debug(f"auxiliary usage reconciliation failed: {exc}")
    finally:
        try:
            _flush(max(0.0, deadline - time.monotonic()))
        except Exception as exc:  # fail-open
            _debug(f"flush failed: {exc}")


def _aux_usage(session_id: str, deadline: Optional[float] = None) -> Any:
    """The session's own auxiliary calls, plus those of every subagent it spawned.

    A delegated child records its usage under its own session id and never gets a
    finalize of its own, so its auxiliary rows are only reachable from here — and
    they belong to the parent's session, which is where its spans already are.
    """
    spans: list = []
    context = _BUILDER.context_for_session(session_id)
    for sid in [session_id, *_BUILDER.child_sessions(session_id)]:
        session = _BUILDER.session_state(sid)
        if session is None or session.aux_emitted:
            continue
        session.aux_emitted = True
        spans.extend(aux_spans(sid, session.exported, context, deadline))
    return spans


def on_subagent_start(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_subagent_start(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"subagent_start handler failed: {exc}")


def on_subagent_stop(**kwargs: Any) -> None:
    if not _config()["enabled"]:
        return
    try:
        _BUILDER.on_subagent_stop(**kwargs)
    except Exception as exc:  # fail-open
        _debug(f"subagent_stop handler failed: {exc}")


# ─────────────────────── child-process context ─────────────────────────────
# Published for the duration of a tool call, so a harness the tool spawns attaches
# under that tool's span instead of starting a trace of its own.

# os.environ is process-wide while Hermes runs each turn on its own thread, so the
# export is owned by one tool call at a time: a concurrent call keeps its context on
# the ContextVar (child_env) rather than overwriting a sibling's variables and
# restoring them to the wrong values afterwards.
_ENV_LOCK = threading.Lock()
_ENV_OWNER: Optional[int] = None
_ENV_UNDO: Optional[Dict[str, Optional[str]]] = None


def _publish_child_context(kwargs: Dict[str, Any]) -> None:
    context = _BUILDER.child_context(**kwargs)
    if context is None:
        return
    set_active(context)
    if _config().get("export_traceparent"):
        _export_to_environ(context)


def _retract_child_context() -> None:
    """Cleared outright rather than restored to a saved token: a tool call that never
    reaches post_tool_call would otherwise leave the next retract restoring a stale
    span, and handing a child the wrong parent is worse than handing it none."""
    _restore_environ()
    set_active(None)


def _export_to_environ(context: ChildContext) -> None:
    """Make every subprocess of this tool call inherit the context for free.

    Opt-in (`LATITUDE_HERMES_EXPORT_TRACEPARENT=1`) and single-owner: only one tool
    call at a time holds the process environment, so a concurrent one is skipped
    rather than corrupting the owner's saved values.

    Skipping does not make that call context-free. os.environ still carries the
    owner's header, so a subprocess the skipped call launches inherits the wrong
    parent span. Process-wide export cannot be made safe under overlapping tool
    calls; `child_env()` is the path that always is.
    """
    global _ENV_OWNER, _ENV_UNDO
    # Both names: a scoped header this process inherited would otherwise outrank the
    # exported one on read. Captured by the same undo, so the original is restored.
    updates = {TRACEPARENT_VAR: context.traceparent, LATITUDE_TRACEPARENT_VAR: context.traceparent}
    if context.session_id:
        updates[SESSION_VAR] = context.session_id
    if context.project:
        updates[PROJECT_VAR] = context.project
    me = threading.get_ident()
    with _ENV_LOCK:
        if _ENV_OWNER is not None and _ENV_OWNER != me and _owner_alive(_ENV_OWNER):
            _debug("environment export skipped: a concurrent tool call owns it; use child_env()")
            return
        # A tool call that never reached post_tool_call left its export standing;
        # restore the original values before capturing this call's undo over them.
        if _ENV_OWNER != me:
            _restore_environ_locked()
        undo = _ENV_UNDO if _ENV_UNDO is not None else {}
        for name in updates:
            undo.setdefault(name, os.environ.get(name))
        _ENV_UNDO = undo
        _ENV_OWNER = me
        os.environ.update(updates)


def _owner_alive(ident: int) -> bool:
    return any(thread.ident == ident for thread in threading.enumerate())


def _restore_environ() -> None:
    with _ENV_LOCK:
        if _ENV_OWNER is not None and _ENV_OWNER != threading.get_ident():
            return
        _restore_environ_locked()


def _restore_environ_locked() -> None:
    global _ENV_OWNER, _ENV_UNDO
    if _ENV_UNDO is not None:
        for name, prior in _ENV_UNDO.items():
            if prior is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = prior
    _ENV_UNDO = None
    _ENV_OWNER = None


def register(ctx: Any) -> None:
    """Entry point called by the Hermes plugin system.

    The callback families fire at different times with different kwargs, so they
    bind to different builder methods: pre/post_api_request are the LLM-call
    span boundary, pre/post_llm_call frame the turn, the stream hooks supply
    TTFT, and the session hooks bound the memory read and flush the exporter.
    """
    set_plugin_context(ctx)
    ctx.register_hook("pre_api_request", on_pre_api_request)
    ctx.register_hook("post_api_request", on_post_api_request)
    ctx.register_hook("api_request_error", on_api_request_error)
    ctx.register_hook("pre_llm_call", on_pre_llm_call)
    ctx.register_hook("post_llm_call", on_post_llm_call)
    ctx.register_hook("pre_tool_call", on_pre_tool_call)
    ctx.register_hook("post_tool_call", on_post_tool_call)
    ctx.register_hook("on_stream_start", on_stream_start)
    if _config().get("stream_ttft"):
        ctx.register_hook("on_stream_delta", on_stream_delta)
    ctx.register_hook("on_stream_end", on_stream_end)
    ctx.register_hook("on_session_start", on_session_start)
    ctx.register_hook("on_session_end", on_session_end)
    ctx.register_hook("on_session_reset", on_session_reset)
    ctx.register_hook("on_session_finalize", on_session_finalize)
    ctx.register_hook("subagent_start", on_subagent_start)
    ctx.register_hook("subagent_stop", on_subagent_stop)
