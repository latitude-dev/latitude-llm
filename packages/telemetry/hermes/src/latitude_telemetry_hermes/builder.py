# ─────────────────────────── builder ───────────────────────────────────────
# Spans are handed to the exporter as they close and each span id ships exactly
# once: `spans` collapses a resend but `traces_mv`/`sessions_mv` are additive
# per-insert rollups, so a duplicate would inflate span counts, tokens and cost.
# The consequence is that the interaction root — whose aggregates are only known
# at turn end — is always the last span of its turn to ship.

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from . import memory as memory_store
from .config import (
    _MAX_RUNS,
    MAX_SESSIONS,
    MAX_STREAM_WATCHES,
    MAX_SUBAGENTS,
    _config,
    _debug,
)
from .context import build_session_context
from .hermes import estimate_cost
from .messages import (
    _count_tool_calls,
    _has_content,
    _normalize_assistant,
    _tool_result,
    normalize_messages,
    system_instructions_from,
)
from .model import _Run, _Session, _Span, _StreamWatch, _Subagent
from .propagation import (
    MAX_INHERITED_TURNS,
    ChildContext,
    InheritedContext,
    format_traceparent,
    inherited_context,
    inherited_session_id,
)
from .tools import resolve_tool_definitions
from .util import _now_ms, _safe_json, _span_id, _trace_id, _trace_key

_DELEGATE_TOOLS = ("delegate", "spawn_agent", "subagent")

# Hermes names the background-review fork's thread (run_agent.py `_spawn_background_review`).
# Every ordinary turn also gets its own worker thread, so the thread's *name* is the only
# honest discriminator — thread identity is not.
_REVIEW_THREAD_NAME = "bg-review"

_USAGE_KEYS = (
    ("input_tokens", "gen_ai.usage.input_tokens"),
    ("output_tokens", "gen_ai.usage.output_tokens"),
    ("cache_read_tokens", "gen_ai.usage.cache_read.input_tokens"),
    ("cache_write_tokens", "gen_ai.usage.cache_creation.input_tokens"),
    ("reasoning_tokens", "gen_ai.usage.reasoning_tokens"),
    ("total_tokens", "gen_ai.usage.total_tokens"),
)


class _Builder:
    def __init__(self) -> None:
        self._runs: Dict[str, _Run] = {}
        self._sessions: Dict[str, _Session] = {}
        self._subagents: Dict[str, _Subagent] = {}
        self._streams: Dict[Tuple[str, str], _StreamWatch] = {}
        self._inherited_turns = 0
        self._lock = threading.Lock()
        self._stream_lock = threading.Lock()

    # -- turn framing --------------------------------------------------------

    def on_pre_llm_call(self, **kw: Any) -> List[_Span]:
        """Open the interaction run at the start of a turn.

        Fires once per turn, before any API call, and carries the identity
        Hermes only exposes here: `sender_id` is the platform user id.
        """
        session = self._touch_session(kw)
        sender_id = str(kw.get("sender_id") or "").strip()
        if sender_id:
            session.sender_id = sender_id
        parent = str(kw.get("parent_session_id") or "").strip()
        if parent:
            session.parent_session_id = parent

        messages = _pick_messages(kw)
        if not messages:
            return []
        with self._lock:
            key = _run_key(kw)
            run = self._runs.get(key)
            if run is None:
                evicted = self._evict_locked()
                self._runs[key] = self._start_run(key, kw, now=_now_ms())
                return evicted
            run.updated_at = time.time()
            return []

    def on_post_llm_call(self, **kw: Any) -> List[_Span]:
        """Ship the run when the turn ends on a tool call or was cut short.

        A no-op when on_post_api_request already finished the run on a final
        content answer.
        """
        with self._lock:
            return self._finish_locked(_run_key(kw))

    # -- model calls ---------------------------------------------------------

    def on_pre_api_request(self, **kw: Any) -> List[_Span]:
        messages = _pick_messages(kw)
        if not messages:  # not a request-shaped call (e.g. context injection)
            return []
        now = _now_ms()
        shipped: List[_Span] = []
        with self._lock:
            key = _run_key(kw)
            run = self._runs.get(key)
            if run is None:
                shipped.extend(self._evict_locked())
                run = self._start_run(key, kw, now)
                self._runs[key] = run
            run.updated_at = time.time()
            # A turn is framed by pre_llm_call, whose payload has no route in it,
            # so these are only knowable once the first request fires.
            run.extra_metadata.update(_route_metadata(kw))

            system_prompt = system_instructions_from(kw.get("system_prompt"), messages)
            if system_prompt:
                run.system_prompt = system_prompt
                run.root.attrs.setdefault("gen_ai.system_instructions:gated", _text_parts(system_prompt))

            shipped.extend(self._memory_reads_locked(run, now))

            req_key = _generation_key(kw)
            superseded = run.generations.pop(req_key, None)
            if superseded is not None:
                _abandon(superseded, "llm_request superseded by a repeated attempt", now)
                shipped.append(superseded)

            normalized, unknown = normalize_messages(messages)
            run.unknown_items += unknown
            span = _Span(
                trace_id=run.trace_id,
                span_id=_span_id(),
                parent_span_id=run.root.span_id,
                name="llm_request",
                start_ms=now,
                attrs={
                    **self._context(run),
                    "span.type": "llm_request",
                    "gen_ai.operation.name": "chat",
                    "llm_request.call_index": kw.get("api_call_count") or run.llm_calls,
                    "gen_ai.input.messages:gated": normalized,
                    "gen_ai.system_instructions:gated": _text_parts(run.system_prompt),
                    "gen_ai.tool.definitions:gated": self._tool_definitions_locked(run, kw),
                    "hermes.tool_definitions.source": run.session.tool_definitions_source or None,
                },
            )
            if unknown:
                span.attrs["hermes.unknown_items"] = unknown
            provider = kw.get("provider")
            model = kw.get("model")
            if provider:
                span.attrs["gen_ai.provider.name"] = provider
                span.attrs["gen_ai.system"] = provider
            if model:
                span.attrs["model"] = model
                span.attrs["gen_ai.request.model"] = model
            if isinstance(kw.get("max_tokens"), int):
                span.attrs["gen_ai.request.max_tokens"] = kw["max_tokens"]
            for attr, source in (
                ("hermes.retry_count", "retry_count"),
                ("hermes.approx_input_tokens", "approx_input_tokens"),
                ("hermes.message_count", "message_count"),
                ("hermes.tool_count", "tool_count"),
            ):
                if isinstance(kw.get(source), int):
                    span.attrs[attr] = kw[source]
            run.generations[req_key] = span
            run.llm_calls += 1
        return shipped

    def on_post_api_request(self, **kw: Any) -> List[_Span]:
        now = _now_ms()
        with self._lock:
            key = _run_key(kw)
            run = self._runs.get(key)
            if run is None:
                return []
            span = run.generations.pop(_generation_key(kw), None) or self._loose_generation_locked(run, kw)
            if span is None:
                return []
            span.end_ms = now
            assistant = kw.get("assistant_message")
            if assistant is None:
                assistant = kw.get("assistant_response")
            output = _normalize_assistant(assistant)
            if output:
                span.attrs["gen_ai.output.messages:gated"] = [output]
                run.last_output = output
            response_model = kw.get("response_model") or kw.get("model")
            if response_model:
                span.attrs["gen_ai.response.model"] = response_model
                span.attrs.setdefault("gen_ai.request.model", kw.get("model") or response_model)
            if kw.get("provider"):
                span.attrs.setdefault("gen_ai.provider.name", kw["provider"])
                span.attrs.setdefault("gen_ai.system", kw["provider"])
            usage = kw.get("usage")
            _apply_usage(span, usage)
            self._apply_cost(span, kw, usage)
            self._record_export_locked(run, usage)
            if isinstance(kw.get("api_duration"), (int, float)) and kw["api_duration"] > 0:
                span.attrs["hermes.api_duration_s"] = float(kw["api_duration"])
            if kw.get("finish_reason"):
                span.attrs["gen_ai.response.finish_reasons"] = [kw["finish_reason"]]
                run.extra_metadata["hermes.finish_reason"] = kw["finish_reason"]
            span.attrs["llm_request.duration_ms"] = max(0, span.end_ms - span.start_ms)
            self._apply_stream_locked(span, kw)
            run.updated_at = time.time()

            tool_count = _count_tool_calls(assistant) or (kw.get("assistant_tool_call_count") or 0)
            has_content = _has_content(assistant, kw.get("assistant_content_chars") or 0)
            if tool_count == 0 and has_content:
                if output:
                    run.root.attrs["gen_ai.output.messages:gated"] = [output]
                return [span] + self._finish_locked(key, "completed")
        return [span]

    def on_api_request_error(self, **kw: Any) -> List[_Span]:
        """A real failed attempt: status code, reason and retryability, instead
        of the opaque `abandoned` a superseded span used to report."""
        now = _now_ms()
        with self._lock:
            run = self._runs.get(_run_key(kw))
            if run is None:
                return []
            span = run.generations.pop(_generation_key(kw), None) or self._loose_generation_locked(run, kw)
            if span is None:
                return []
            span.end_ms = now
            error = kw.get("error") if isinstance(kw.get("error"), dict) else {}
            error_type = str(kw.get("reason") or error.get("type") or "api_request_error")
            message = str(error.get("message") or kw.get("reason") or "API request failed")
            span.outcome = "error"
            span.error_message = message
            span.attrs["error.type"] = error_type
            span.attrs["error.message:gated"] = message
            if isinstance(kw.get("status_code"), int):
                span.attrs["hermes.error.status_code"] = kw["status_code"]
            if isinstance(kw.get("retryable"), bool):
                span.attrs["hermes.error.retryable"] = kw["retryable"]
            if kw.get("reason"):
                span.attrs["hermes.error.reason"] = str(kw["reason"])
            if isinstance(kw.get("retry_count"), int):
                span.attrs["hermes.retry_count"] = kw["retry_count"]
            if isinstance(kw.get("max_retries"), int):
                span.attrs["hermes.error.max_retries"] = kw["max_retries"]
            if isinstance(kw.get("api_duration"), (int, float)) and kw["api_duration"] > 0:
                span.attrs["hermes.api_duration_s"] = float(kw["api_duration"])
            span.attrs["llm_request.duration_ms"] = max(0, span.end_ms - span.start_ms)
            self._apply_stream_locked(span, kw)
            run.updated_at = time.time()
            return [span]

    # -- tools ---------------------------------------------------------------

    def on_pre_tool_call(self, **kw: Any) -> None:
        with self._lock:
            run = self._runs.get(_run_key(kw))
            if run is None:
                return
            tool_name = kw.get("tool_name") or "unknown"
            tool_call_id = kw.get("tool_call_id") or ""
            span = _Span(
                trace_id=run.trace_id,
                span_id=_span_id(),
                parent_span_id=run.root.span_id,
                name=f"tool_call:{tool_name}",
                start_ms=_now_ms(),
                kind=3,
                attrs={
                    **self._context(run),
                    "span.type": "tool_execution",
                    "gen_ai.operation.name": "execute_tool",
                    "gen_ai.tool.name": tool_name,
                    "gen_ai.tool.call.id": tool_call_id or None,
                    "gen_ai.tool.call.arguments:gated": _safe_json(kw.get("args")) or None,
                },
            )
            run.open_tools[tool_call_id or span.span_id] = span
            run.updated_at = time.time()

    def on_post_tool_call(self, **kw: Any) -> List[_Span]:
        now = _now_ms()
        with self._lock:
            run = self._runs.get(_run_key(kw))
            if run is None:
                return []
            tool_call_id = kw.get("tool_call_id") or ""
            span = run.open_tools.pop(tool_call_id, None) if tool_call_id else None
            if span is None and run.open_tools:
                span = run.open_tools.pop(next(iter(run.open_tools)))
            if span is None:
                return []
            span.end_ms = now
            is_error = str(kw.get("status") or "ok").lower() == "error"
            span.outcome = "error" if is_error else "ok"
            result = _tool_result(kw.get("result"))
            span.attrs["gen_ai.tool.call.result:gated"] = result if isinstance(result, str) else _safe_json(result)
            span.attrs["tool.is_error"] = is_error
            span.attrs["success"] = "false" if is_error else "true"
            if is_error:
                message = str(kw.get("error_message") or "Tool execution failed")
                span.error_message = message
                span.attrs["error.type"] = str(kw.get("error_type") or "tool_error")
                span.attrs["error.message:gated"] = message
            duration = kw.get("duration_ms")
            measured = max(0, span.end_ms - span.start_ms)
            span.attrs["hermes.tool.duration_ms"] = (
                int(duration) if isinstance(duration, (int, float)) and duration > 0 else measured
            )
            run.tool_calls += 1
            run.updated_at = time.time()
            shipped = [span]
            memory_span = self._memory_write_locked(run, span, kw, now)
            if memory_span is not None:
                shipped.append(memory_span)
            return shipped

    # -- stream observers ----------------------------------------------------

    def on_stream_start(self, **kw: Any) -> None:
        key = _stream_key(kw)
        with self._stream_lock:
            self._prune_streams_locked()
            self._streams[key] = _StreamWatch(started_ms=_now_ms())

    def on_stream_delta(self, **kw: Any) -> None:
        """O(1): Hermes builds and enqueues a payload per delta once any callback
        is registered, so this may not do more than a dict probe."""
        with self._stream_lock:
            watch = self._streams.get(_stream_key(kw))
            if watch is None or watch.first_delta_ms is not None:
                return
            watch.first_delta_ms = _now_ms()

    def on_stream_end(self, **kw: Any) -> None:
        with self._stream_lock:
            watch = self._streams.get(_stream_key(kw))
            if watch is None:
                return
            error = kw.get("error")
            if error:
                watch.error = str(error)
            elif kw.get("finished") is False:
                watch.error = "stream ended unfinished"

    # -- session lifecycle ---------------------------------------------------

    def on_session_start(self, **kw: Any) -> None:
        self._reset_session(str(kw.get("session_id") or ""))

    def on_session_reset(self, **kw: Any) -> None:
        for key in ("session_id", "old_session_id", "new_session_id"):
            self._reset_session(str(kw.get(key) or ""))

    def finish_scoped(self, **kw: Any) -> List[_Span]:
        """Finalize the still-open runs of one ending turn or session.

        Scoped to the ending session so a gateway teardown of one session never
        pops runs still live in a concurrent one. With no session identifier
        (single CLI session) it finalizes every open run.
        """
        session_id = str(kw.get("session_id") or "")
        task_id = str(kw.get("task_id") or "")
        outcome = _turn_outcome(kw)
        with self._lock:
            keys = [key for key, run in self._runs.items() if _run_in_scope(run, session_id, task_id)]
            spans: List[_Span] = []
            for key in keys:
                spans.extend(self._finish_locked(key, outcome, kw.get("turn_exit_reason")))
            return spans

    # -- subagents -----------------------------------------------------------

    def on_subagent_start(self, **kw: Any) -> None:
        child_session_id = str(kw.get("child_session_id") or "")
        if not child_session_id:
            return
        parent_session_id = str(kw.get("parent_session_id") or "")
        parent_turn_id = str(kw.get("parent_turn_id") or "")
        child_role = str(kw.get("child_role") or "subagent")
        with self._lock:
            parent = self._find_run_locked(parent_session_id, parent_turn_id)
            if parent is None:
                return
            anchor = _open_delegate_span(parent) or parent.root
            self._prune_subagents_locked()
            self._subagents[child_session_id] = _Subagent(
                parent_session_id=parent.reported_session_id,
                parent_turn_id=parent_turn_id,
                child_role=child_role,
                child_subagent_id=str(kw.get("child_subagent_id") or ""),
                child_goal=str(kw.get("child_goal") or ""),
                trace_id=parent.trace_id,
                parent_span_id=anchor.span_id,
            )
            tag = f"subagent:{child_role}"
            if tag not in parent.extra_tags:
                parent.extra_tags.append(tag)

    def on_subagent_stop(self, **kw: Any) -> None:
        child_session_id = str(kw.get("child_session_id") or "")
        with self._lock:
            link = self._subagents.pop(child_session_id, None)
            target = self._find_run_locked(child_session_id, "")
            span = target.root if target is not None else None
            if span is None and link is not None:
                parent = self._find_run_locked(link.parent_session_id, link.parent_turn_id)
                span = _open_delegate_span(parent) if parent is not None else None
            if span is None:
                return
            if kw.get("child_status"):
                span.attrs["hermes.subagent.status"] = str(kw["child_status"])
            if kw.get("child_summary"):
                span.attrs["hermes.subagent.summary:gated"] = str(kw["child_summary"])
            if isinstance(kw.get("duration_ms"), (int, float)) and kw["duration_ms"] > 0:
                span.attrs["hermes.subagent.duration_ms"] = int(kw["duration_ms"])
            history = kw.get("tool_call_history")
            if isinstance(history, (list, tuple)) and history:
                span.attrs["hermes.subagent.tool_calls"] = len(history)

    # -- internals -----------------------------------------------------------

    def _start_run(self, key: str, kw: Dict[str, Any], now: int) -> _Run:
        session_id = str(kw.get("session_id") or kw.get("task_id") or key)
        session = self._session_locked(session_id, kw)
        task_id = str(kw.get("task_id") or "")
        turn_id = str(kw.get("turn_id") or "")
        link = self._subagents.get(session_id)
        external = self._inherited_link_locked() if link is None else None
        # Read on its own: past the join ceiling turns root their own traces but stay
        # grouped by the session id the parent handed us.
        inherited_session = "" if link else self._inherited_session_locked()
        if link is not None:
            # A delegated child belongs to the parent's session, so it carries the
            # parent's identity rather than minting one from `platform="subagent"`.
            parent = self._sessions.get(link.parent_session_id)
            if parent is not None:
                if parent.context is not None:
                    session.context = parent.context
                # A child's own auxiliary calls land in the ledger under the
                # child's session id, which never gets a finalize of its own.
                if session_id not in parent.child_sessions:
                    parent.child_sessions.append(session_id)
        thread = threading.current_thread()
        is_background = thread.name.startswith(_REVIEW_THREAD_NAME)

        trace_id = link.trace_id if link else (external.trace_id if external else _trace_id())
        parent_span_id = link.parent_span_id if link else (external.parent_span_id if external else "")
        run = _Run(
            trace_key=key,
            trace_id=trace_id,
            root=_Span(
                trace_id="",
                span_id=_span_id(),
                parent_span_id=parent_span_id,
                name="interaction",
                start_ms=now,
            ),
            session=session,
            session_id=session_id,
            reported_session_id=(link.parent_session_id if link else (inherited_session or session_id)),
            task_id=task_id,
            turn_id=turn_id,
            subagent=link,
            thread_name=thread.name,
            is_background=is_background,
        )
        run.root.trace_id = run.trace_id
        run.extra_metadata = _run_metadata(kw, session, link)
        if inherited_session and inherited_session != session_id:
            run.extra_metadata["hermes.session.id"] = session_id
        if external:
            self._inherited_turns += 1
            run.extra_metadata["latitude.parent.trace_id"] = external.trace_id
            run.extra_metadata["latitude.parent.span_id"] = external.parent_span_id
        if link:
            run.extra_tags.append(f"subagent:{link.child_role}")

        kind = "subagent" if link else ("background" if is_background else "user")
        root_attrs: Dict[str, Any] = {
            **self._context(run),
            "span.type": "interaction",
            "interaction.kind": kind,
        }
        user_message = _coerce_text(kw.get("user_message"))
        if user_message.strip():
            root_attrs["user_prompt:gated"] = user_message
            root_attrs["gen_ai.input.messages:gated"] = [
                {"role": "user", "parts": [{"type": "text", "content": user_message}]}
            ]
        elif link and link.child_goal:
            root_attrs["user_prompt:gated"] = link.child_goal
            root_attrs["gen_ai.input.messages:gated"] = [
                {"role": "user", "parts": [{"type": "text", "content": link.child_goal}]}
            ]
        run.root.attrs = root_attrs
        return run

    def _context(self, run: _Run) -> Dict[str, Any]:
        context = run.session.context
        tags = list(context.tags) if context else ["hermes"]
        for tag in run.extra_tags:
            if tag not in tags:
                tags.append(tag)
        metadata: Dict[str, Any] = dict(context.metadata) if context else {}
        metadata.update(run.extra_metadata)
        attrs: Dict[str, Any] = {
            "session.id": run.reported_session_id,
            "gen_ai.session.id": run.reported_session_id,
            "service.instance.id": run.reported_session_id,
            "latitude.tags": tags,
            "latitude.metadata": metadata,
            "hermes.thread.name": run.thread_name or None,
        }
        if run.session.sender_id:
            attrs["user.id"] = run.session.sender_id
            if _looks_like_email(run.session.sender_id):
                attrs["user.email"] = run.session.sender_id
        agent_name = run.subagent.child_role if run.subagent else (context.agent_name if context else "")
        if agent_name:
            attrs["gen_ai.agent.name"] = agent_name
        if run.subagent:
            attrs["subagent.name"] = run.subagent.child_role
            attrs["subagent.type"] = run.subagent.child_role
            if run.subagent.child_subagent_id:
                attrs["subagent.id"] = f"{run.subagent.child_role}:{run.subagent.child_subagent_id}"
        return attrs

    def _touch_session(self, kw: Dict[str, Any]) -> _Session:
        with self._lock:
            return self._session_locked(str(kw.get("session_id") or kw.get("task_id") or ""), kw)

    def _session_locked(self, session_id: str, kw: Dict[str, Any]) -> _Session:
        session = self._sessions.get(session_id)
        if session is None:
            if len(self._sessions) >= MAX_SESSIONS:
                oldest = min(self._sessions, key=lambda k: self._sessions[k].updated_at)
                self._sessions.pop(oldest, None)
            session = _Session(session_id=session_id)
            self._sessions[session_id] = session
        if session.context is None:
            session.context = build_session_context(kw, _config(), session_id)
        session.updated_at = time.time()
        return session

    def _reset_session(self, session_id: str) -> None:
        if not session_id:
            return
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return
            session.memory_read_done = False
            session.context = None
            session.updated_at = time.time()

    def _inherited_link_locked(self) -> Optional[InheritedContext]:
        """The span this process was launched under, until the join ceiling is hit."""
        if not _config().get("inherit_context"):
            return None
        if self._inherited_turns >= MAX_INHERITED_TURNS:
            return None
        return inherited_context()

    def _inherited_session_locked(self) -> str:
        """The session id this process was launched with, ceiling or not."""
        if not _config().get("inherit_context"):
            return ""
        return inherited_session_id()

    def child_context(self, **kw: Any) -> Optional[ChildContext]:
        """Context for a subprocess spawned by the tool call `kw` describes.

        Anchored on that tool's own span, so the child harness lands under the tool
        invocation that launched it rather than beside it under the turn.
        """
        with self._lock:
            run = self._runs.get(_run_key(kw))
            if run is None:
                return None
            tool_call_id = str(kw.get("tool_call_id") or "")
            span = run.open_tools.get(tool_call_id) if tool_call_id else None
            if span is None:
                span = next(reversed(list(run.open_tools.values())), None) if run.open_tools else None
            anchor = span or run.root
            return ChildContext(
                traceparent=format_traceparent(run.trace_id, anchor.span_id),
                session_id=run.reported_session_id,
                project=str(_config().get("project") or ""),
            )

    def _find_run_locked(self, session_id: str, turn_id: str) -> Optional[_Run]:
        candidates = [run for run in self._runs.values() if run.session_id == session_id]
        if not candidates:
            return None
        if turn_id:
            for run in candidates:
                if run.turn_id == turn_id:
                    return run
        return max(candidates, key=lambda run: run.updated_at)

    def _loose_generation_locked(self, run: _Run, kw: Dict[str, Any]) -> Optional[_Span]:
        """Fall back to the newest open attempt of the same api_call_count.

        `api_request_error` and `post_api_request` do not always report the same
        `retry_count` as the `pre_api_request` that opened the span, so the exact
        key can miss while the attempt is unambiguous.
        """
        prefix = f"{kw.get('api_call_count') or 0}:"
        keys = [key for key in run.generations if key.startswith(prefix)]
        if not keys:
            return None
        return run.generations.pop(max(keys, key=lambda key: int(key.split(":")[1])))

    def _tool_definitions_locked(self, run: _Run, kw: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Resolved per call, keeping the most trustworthy answer seen so far."""
        if not _config().get("tool_definitions"):
            return None
        session = run.session
        resolved = resolve_tool_definitions(kw)
        if resolved is not None:
            definitions, source = resolved
            if source == "request" or session.tool_definitions is None:
                session.tool_definitions = definitions
                session.tool_definitions_source = source
        return session.tool_definitions

    def _record_export_locked(self, run: _Run, usage: Any) -> None:
        """Count what we exported for this session.

        A total, not a per-task breakdown: the hooks carry no task label, and
        guessing one from the thread was wrong — Hermes runs every turn on its own
        worker thread. The auxiliary reconciliation only needs this as a guard.
        """
        if not isinstance(usage, dict):
            return
        exported = run.session.exported
        exported["api_call_count"] = exported.get("api_call_count", 0) + 1
        for source, _ in _USAGE_KEYS:
            if source == "total_tokens":
                continue
            value = usage.get(source)
            if isinstance(value, (int, float)):
                exported[source] = exported.get(source, 0) + int(value)

    def _apply_cost(self, span: _Span, kw: Dict[str, Any], usage: Any) -> None:
        if not isinstance(usage, dict):
            return
        cost = estimate_cost(
            str(kw.get("model") or ""),
            usage,
            str(kw.get("provider") or ""),
            str(kw.get("base_url") or ""),
        )
        if cost is None:
            return
        if cost["status"]:
            span.attrs["hermes.cost.status"] = cost["status"]
        if cost["label"]:
            span.attrs["hermes.cost.label"] = cost["label"]
        if cost["billing_mode"]:
            span.attrs["hermes.billing.mode"] = cost["billing_mode"]
        if cost["provider"]:
            span.attrs["hermes.provider.raw"] = cost["provider"]
        # Only a provider-reported figure beats Latitude's catalog: an estimate
        # would present itself as authoritative and flip costIsEstimated to false.
        if cost["status"] == "actual" and cost["amount"]:
            span.attrs["gen_ai.usage.cost"] = float(cost["amount"])

    def _apply_stream_locked(self, span: _Span, kw: Dict[str, Any]) -> None:
        with self._stream_lock:
            watch = self._streams.pop(_stream_key(kw), None)
        if watch is None:
            return
        span.attrs["gen_ai.request.stream"] = True
        if watch.error:
            span.attrs["hermes.stream.error"] = watch.error
        if watch.first_delta_ms is None:
            return
        ttft_ms = max(0, watch.first_delta_ms - span.start_ms)
        duration_ms = max(0, (span.end_ms or span.start_ms) - span.start_ms)
        # Deltas arrive off the token path, so TTFT is an upper bound; a value
        # past the span's own duration is noise Latitude would discard anyway.
        if ttft_ms <= duration_ms:
            span.attrs["gen_ai.server.time_to_first_token"] = ttft_ms * 1_000_000

    def _memory_reads_locked(self, run: _Run, now: int) -> List[_Span]:
        """Hermes injects memory as a frozen snapshot at session start, so the
        store is read exactly once per session."""
        session = run.session
        if session.memory_read_done or not memory_store.enabled():
            return []
        session.memory_read_done = True
        spans = []
        for op in memory_store.session_reads():
            spans.append(self._memory_span(run, run.root.span_id, op, now, now))
        return spans

    def _memory_write_locked(self, run: _Run, tool_span: _Span, kw: Dict[str, Any], now: int) -> Optional[_Span]:
        if kw.get("tool_name") != "memory" or not memory_store.enabled():
            return None
        if str(kw.get("status") or "ok").lower() == "error" or not memory_store.write_succeeded(kw.get("result")):
            return None
        op = memory_store.classify_write(kw.get("args"), kw.get("result"))
        if op is None:
            return None
        return self._memory_span(run, tool_span.span_id, op, tool_span.start_ms, now)

    def _memory_span(self, run: _Run, parent_span_id: str, op: Dict[str, Any], start_ms: int, end_ms: int) -> _Span:
        attrs: Dict[str, Any] = {
            **self._context(run),
            "gen_ai.operation.name": op["operation"],
            "gen_ai.memory.store.id": memory_store.store_id(),
            "gen_ai.memory.record.id": op["record_id"],
            "gen_ai.memory.record.count": 1,
            "hermes.memory.action": op.get("action"),
            "hermes.memory.entry_count": op.get("entry_count"),
            "hermes.memory.chars": op.get("chars"),
            "hermes.memory.limit_chars": op.get("limit"),
        }
        if op.get("body") and memory_store.capture_bodies():
            attrs["gen_ai.memory.records:gated"] = memory_store.records_attribute(op["record_id"], op["body"])
        return _Span(
            trace_id=run.trace_id,
            span_id=_span_id(),
            parent_span_id=parent_span_id,
            name=op["operation"],
            start_ms=start_ms,
            end_ms=end_ms,
            kind=3,
            attrs=attrs,
        )

    def _finish_locked(self, key: str, outcome: str = "", exit_reason: Any = None) -> List[_Span]:
        run = self._runs.pop(key, None)
        if run is None:
            return []
        now = _now_ms()
        spans: List[_Span] = []
        for span in run.generations.values():
            span.attrs["hermes.usage.state"] = "unreported"
            run.llm_calls_unreported += 1
            self._close_leftover(span, "llm_request", outcome, now)
            spans.append(span)
        for span in run.open_tools.values():
            self._close_leftover(span, "tool_execution", outcome, now)
            if span.outcome == "error":
                span.attrs["tool.is_error"] = True
            spans.append(span)
        run.generations.clear()
        run.open_tools.clear()

        root = run.root
        if "gen_ai.output.messages:gated" not in root.attrs and run.last_output:
            root.attrs["gen_ai.output.messages:gated"] = [run.last_output]
        root.end_ms = now
        root.attrs.update(self._context(run))
        root.attrs["hermes.llm_calls"] = run.llm_calls
        root.attrs["hermes.tool_calls"] = run.tool_calls
        root.attrs["interaction.duration_ms"] = max(0, now - root.start_ms)
        if run.llm_calls_unreported:
            root.attrs["hermes.llm_calls_unreported"] = run.llm_calls_unreported
        if run.unknown_items:
            root.attrs["hermes.unknown_items"] = run.unknown_items
        if exit_reason:
            root.attrs["hermes.turn.exit_reason"] = str(exit_reason)
        if outcome:
            root.attrs["hermes.turn.outcome"] = outcome
        if outcome == "failed":
            root.outcome = "error"
            root.error_message = "turn failed"
            root.attrs["error.type"] = "turn_failed"
        spans.append(root)  # root last: its aggregates are only known now
        return spans

    def _close_leftover(self, span: _Span, kind: str, outcome: str, now: int) -> None:
        if span.end_ms is None:
            span.end_ms = now
        if outcome == "interrupted":
            span.attrs["hermes.span.closed_reason"] = "turn_interrupted"
            return
        if outcome == "failed":
            span.outcome = "error"
            span.error_message = f"{kind} failed with the turn"
            span.attrs["error.type"] = "turn_failed"
            span.attrs["hermes.span.closed_reason"] = "turn_failed"
            return
        _abandon(span, f"{kind} abandoned before its completion hook", now)

    def _evict_locked(self) -> List[_Span]:
        """Evicting must never lose a turn: finalize it and ship it instead."""
        if len(self._runs) < _MAX_RUNS:
            return []
        oldest = min(self._runs, key=lambda k: self._runs[k].updated_at)
        _debug(f"evicting the oldest live run ({oldest}) at the {_MAX_RUNS}-run bound")
        return self._finish_locked(oldest)

    def _prune_streams_locked(self) -> None:
        if len(self._streams) < MAX_STREAM_WATCHES:
            return
        oldest = min(self._streams, key=lambda k: self._streams[k].updated_at)
        self._streams.pop(oldest, None)

    def _prune_subagents_locked(self) -> None:
        if len(self._subagents) < MAX_SUBAGENTS:
            return
        oldest = min(self._subagents, key=lambda k: self._subagents[k].created_at)
        self._subagents.pop(oldest, None)

    def session_state(self, session_id: str) -> Optional[_Session]:
        with self._lock:
            return self._sessions.get(session_id)

    def child_sessions(self, session_id: str) -> List[str]:
        with self._lock:
            session = self._sessions.get(session_id)
            return list(session.child_sessions) if session is not None else []

    def context_for_session(self, session_id: str) -> Dict[str, Any]:
        attrs: Dict[str, Any] = {
            "session.id": session_id,
            "gen_ai.session.id": session_id,
            "service.instance.id": session_id,
        }
        with self._lock:
            session = self._sessions.get(session_id)
            context = session.context if session is not None else None
        if context is not None:
            attrs["latitude.tags"] = list(context.tags)
            attrs["latitude.metadata"] = dict(context.metadata)
        return attrs


def _run_key(kw: Dict[str, Any]) -> str:
    return _trace_key(
        str(kw.get("task_id") or ""),
        str(kw.get("session_id") or ""),
        str(kw.get("turn_id") or ""),
        str(kw.get("api_request_id") or ""),
    )


def _generation_key(kw: Dict[str, Any]) -> str:
    """`api_request_id` is stable across retries, so the attempt number is what
    separates one failed call from the one that replaced it."""
    return f"{kw.get('api_call_count') or 0}:{kw.get('retry_count') or 0}"


def _stream_key(kw: Dict[str, Any]) -> Tuple[str, str]:
    iteration = kw.get("iteration")
    if iteration is None:
        iteration = kw.get("api_call_count")
    return str(kw.get("turn_id") or ""), str(iteration or 0)


_ROUTE_METADATA = (
    ("hermes.api_mode", "api_mode"),
    ("hermes.provider", "provider"),
    ("hermes.base_url", "base_url"),
)


def _route_metadata(kw: Dict[str, Any]) -> Dict[str, Any]:
    return {attr: str(kw[source]) for attr, source in _ROUTE_METADATA if kw.get(source)}


def _run_metadata(kw: Dict[str, Any], session: _Session, link: Optional[_Subagent]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = _route_metadata(kw)
    for attr, source in (
        ("hermes.task_id", "task_id"),
        ("hermes.turn_id", "turn_id"),
    ):
        value = kw.get(source)
        if value:
            metadata[attr] = str(value)
    if session.parent_session_id and session.parent_session_id != session.session_id:
        metadata["hermes.parent_session_id"] = session.parent_session_id
    if link:
        metadata["hermes.subagent.session_id"] = session.session_id
        metadata["hermes.subagent.role"] = link.child_role
        if link.child_subagent_id:
            metadata["hermes.subagent.id"] = link.child_subagent_id
    return metadata


def _looks_like_email(value: str) -> bool:
    name, _, domain = value.partition("@")
    return bool(name) and "." in domain and " " not in value


def _turn_outcome(kw: Dict[str, Any]) -> str:
    if kw.get("interrupted"):
        return "interrupted"
    if kw.get("failed"):
        return "failed"
    if kw.get("completed"):
        return "completed"
    return ""


def _open_delegate_span(run: Optional[_Run]) -> Optional[_Span]:
    if run is None:
        return None
    for span in reversed(list(run.open_tools.values())):
        name = span.attrs.get("gen_ai.tool.name") or ""
        if any(family in str(name) for family in _DELEGATE_TOOLS):
            return span
    return None


def _run_in_scope(run: _Run, session_id: str, task_id: str) -> bool:
    if not session_id and not task_id:  # single CLI session: no id to scope by
        return True
    if session_id and run.session_id == session_id:
        return True
    if task_id and run.task_id == task_id:
        return True
    return False


def _pick_messages(kw: Dict[str, Any]) -> List[Any]:
    for k in ("request_messages", "messages", "conversation_history"):
        v = kw.get(k)
        if isinstance(v, list) and v:
            return v
    user_message = kw.get("user_message")
    if user_message is not None:
        return [{"role": "user", "content": user_message}]
    return []


def _text_parts(text: Optional[str]) -> Optional[List[Dict[str, Any]]]:
    return [{"type": "text", "content": text}] if text else None


def _coerce_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    if isinstance(value, list):
        texts = [b.get("text") if isinstance(b, dict) else b for b in value]
        joined = "\n".join(t for t in texts if isinstance(t, str))
        if joined:
            return joined
    return _safe_json(value)


def _apply_usage(span: _Span, usage: Any) -> None:
    """`total_tokens` is load-bearing: it is the arithmetic Latitude's resolver
    uses to infer that input is additive and output includes reasoning."""
    if not isinstance(usage, dict):
        return
    for source, target in _USAGE_KEYS:
        value = usage.get(source)
        if isinstance(value, (int, float)) and value:
            span.attrs[target] = int(value)


def _abandon(span: _Span, message: str, now: int) -> None:
    if span.end_ms is None:
        span.end_ms = now
    span.outcome = "error"
    span.error_message = message
    span.attrs["error.type"] = "abandoned"
    span.attrs["error.message"] = message
