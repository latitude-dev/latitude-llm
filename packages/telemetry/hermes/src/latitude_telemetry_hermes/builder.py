# ─────────────────────────── builder ───────────────────────────────────────

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from .config import _MAX_RUNS, _config
from .messages import (
    _count_tool_calls,
    _has_content,
    _normalize_assistant,
    _normalize_messages,
    _system_prompt,
    _tool_result,
)
from .model import _Run, _Span
from .otlp import _build_otlp
from .util import _now_ms, _safe_json, _span_id, _trace_id, _trace_key


class _Builder:
    def __init__(self) -> None:
        self._runs: Dict[str, _Run] = {}
        self._lock = threading.Lock()

    def on_pre_llm_call(self, **kw: Any) -> None:
        """Turn-level framing: open the interaction run at the start of a turn.

        Fires once per turn, before any API call. Carries the conversation but
        no per-call request payload, so it only seeds the interaction root; the
        llm_request child spans are created by on_pre_api_request.
        """
        messages = _pick_messages(kw)
        if not messages:
            return
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        now = _now_ms()
        with self._lock:
            run = self._runs.get(key)
            if run is None:
                run = self._start_run(key, kw, messages, now)
                self._runs[key] = run
            run.updated_at = time.time()

    def on_post_llm_call(self, **kw: Any) -> Optional[Dict[str, Any]]:
        """Turn-level framing: finalize and ship the run when the turn ends.

        No-op when on_post_api_request already finished the run on a final
        content answer (the run is gone); otherwise (turn ended on a tool call
        or was cut short) this ships the trace so nothing leaks past turn end.
        """
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        with self._lock:
            if key not in self._runs:
                return None
            return self._finish_locked(key)

    def on_pre_api_request(self, **kw: Any) -> None:
        messages = _pick_messages(kw)
        if not messages:  # not a request-shaped call (e.g. context injection)
            return
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        now = _now_ms()
        with self._lock:
            run = self._runs.get(key) or self._start_run(key, kw, messages, now)
            self._runs[key] = run
            run.updated_at = time.time()
            req_key = str(kw.get("api_call_count") or 0)
            prev = run.generations.pop(req_key, None)
            if prev is not None:
                _abandon(prev, "llm_request superseded by retry", now)
                run.closed.append(prev)
            run.system_prompt = _system_prompt(messages) or run.system_prompt
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
                    "gen_ai.input.messages:gated": _normalize_messages(messages),
                    "gen_ai.system_instructions:gated": (
                        [{"type": "text", "content": run.system_prompt}] if run.system_prompt else None
                    ),
                },
            )
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
            if kw.get("platform"):
                span.attrs["hermes.platform"] = kw["platform"]
            run.generations[req_key] = span
            run.llm_calls += 1

    def on_post_api_request(self, **kw: Any) -> Optional[Dict[str, Any]]:
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        now = _now_ms()
        with self._lock:
            run = self._runs.get(key)
            if run is None:
                return None
            req_key = str(kw.get("api_call_count") or 0)
            span = run.generations.pop(req_key, None)
            if span is None:
                return None
            span.end_ms = now
            assistant = kw.get("assistant_message")
            if assistant is None:
                assistant = kw.get("assistant_response")
            output = _normalize_assistant(assistant)
            if output:
                span.attrs["gen_ai.output.messages:gated"] = [output]
                run.last_output = output
            model = kw.get("model")
            provider = kw.get("provider")
            if model:
                span.attrs["gen_ai.response.model"] = model
                span.attrs.setdefault("gen_ai.request.model", model)
            if provider:
                span.attrs.setdefault("gen_ai.provider.name", provider)
                span.attrs.setdefault("gen_ai.system", provider)
            _apply_usage(span, kw.get("usage"))
            if isinstance(kw.get("api_duration"), (int, float)) and kw["api_duration"] > 0:
                span.attrs["hermes.api_duration_s"] = float(kw["api_duration"])
            if kw.get("finish_reason"):
                span.attrs["gen_ai.response.finish_reasons"] = [kw["finish_reason"]]
            span.attrs["llm_request.duration_ms"] = max(0, span.end_ms - span.start_ms)
            run.closed.append(span)
            run.updated_at = time.time()

            tool_count = _count_tool_calls(assistant) or (kw.get("assistant_tool_call_count") or 0)
            has_content = _has_content(assistant, kw.get("assistant_content_chars") or 0)
            if tool_count == 0 and has_content:
                if output:
                    run.root.attrs["gen_ai.output.messages:gated"] = [output]
                return self._finish_locked(key)
        return None

    def on_pre_tool_call(self, **kw: Any) -> None:
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        with self._lock:
            run = self._runs.get(key)
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
                attrs={
                    **self._context(run),
                    "span.type": "tool_execution",
                    "gen_ai.operation.name": "execute_tool",
                    "gen_ai.tool.name": tool_name,
                    "gen_ai.tool.call.id": tool_call_id or None,
                    "gen_ai.tool.call.arguments:gated": kw.get("args"),
                },
            )
            run.open_tools[tool_call_id or span.span_id] = span
            run.updated_at = time.time()

    def on_post_tool_call(self, **kw: Any) -> None:
        key = _trace_key(
            kw.get("task_id", ""), kw.get("session_id", ""), kw.get("turn_id", ""), kw.get("api_request_id", "")
        )
        with self._lock:
            run = self._runs.get(key)
            if run is None:
                return
            tool_call_id = kw.get("tool_call_id") or ""
            span = run.open_tools.pop(tool_call_id, None) if tool_call_id else None
            if span is None and run.open_tools:
                # fall back to the oldest open tool span
                first_key = next(iter(run.open_tools))
                span = run.open_tools.pop(first_key)
            if span is None:
                return
            span.end_ms = _now_ms()
            is_error = kw.get("is_error") is True
            span.outcome = "error" if is_error else "ok"
            result = _tool_result(kw.get("result"))
            span.attrs["gen_ai.tool.call.result:gated"] = result
            span.attrs["tool.is_error"] = is_error
            span.attrs["success"] = "false" if is_error else "true"
            if is_error:
                span.error_message = "Tool execution failed"
                span.attrs["error.type"] = "tool_error"
                span.attrs["error.message:gated"] = result
            span.attrs["hermes.tool.duration_ms"] = max(0, span.end_ms - span.start_ms)
            run.closed.append(span)
            run.updated_at = time.time()

    # -- internals --

    def _start_run(self, key: str, kw: Dict[str, Any], messages: Any, now: int) -> _Run:
        session_id = kw.get("session_id") or kw.get("task_id") or key
        task_id = kw.get("task_id") or ""
        trace_id = _trace_id()
        first_user = _last_user_text(messages) or _coerce_text(kw.get("user_message"))
        root_attrs: Dict[str, Any] = {
            "span.type": "interaction",
            "interaction.kind": "user",
            "session.id": session_id,
            "gen_ai.session.id": session_id,
            "hermes.task_id": task_id or None,
            "hermes.turn_id": kw.get("turn_id") or None,
            "latitude.tags": ["hermes"],
            "latitude.metadata": {"hermes.session.id": session_id, "hermes.task_id": task_id}
            if task_id
            else {"hermes.session.id": session_id},
        }
        if isinstance(first_user, str) and first_user.strip():
            root_attrs["user_prompt:gated"] = first_user
            root_attrs["gen_ai.input.messages:gated"] = [
                {"role": "user", "parts": [{"type": "text", "content": first_user}]}
            ]
        root = _Span(
            trace_id=trace_id,
            span_id=_span_id(),
            parent_span_id="",
            name="interaction",
            start_ms=now,
            attrs=root_attrs,
        )
        self._evict_locked()
        return _Run(trace_key=key, trace_id=trace_id, root=root, session_id=session_id, task_id=task_id)

    def _context(self, run: _Run) -> Dict[str, Any]:
        return {
            "latitude.tags": ["hermes"],
            "latitude.metadata": {"hermes.session.id": run.session_id, "hermes.task_id": run.task_id}
            if run.task_id
            else {"hermes.session.id": run.session_id},
            "session.id": run.session_id,
            "gen_ai.session.id": run.session_id,
            "service.instance.id": run.session_id,
        }

    def finish_scoped(self, session_id: str, task_id: str) -> List[Dict[str, Any]]:
        """Finalize the still-open runs of one ending session and return their payloads.

        Called on session end so short/one-shot runs that never hit a clean
        finish still ship before the process exits. Scoped to the ending
        session so a gateway teardown of one session never pops or abandons
        runs still live in a concurrent session. With no session identifier
        (single CLI session) it finalizes every open run.
        """
        with self._lock:
            keys = [key for key, run in self._runs.items() if _run_in_scope(run, session_id, task_id)]
            payloads: List[Dict[str, Any]] = []
            for key in keys:
                payload = self._finish_locked(key)
                if payload is not None:
                    payloads.append(payload)
            return payloads

    def _finish_locked(self, key: str) -> Optional[Dict[str, Any]]:
        run = self._runs.pop(key, None)
        if run is None:
            return None
        now = _now_ms()
        if "gen_ai.output.messages:gated" not in run.root.attrs and run.last_output:
            run.root.attrs["gen_ai.output.messages:gated"] = [run.last_output]
        for span in run.generations.values():
            _abandon(span, "llm_request abandoned before post_api_request", now)
            run.closed.append(span)
        for span in run.open_tools.values():
            _abandon(span, "tool_execution abandoned before post_tool_call", now)
            span.attrs["tool.is_error"] = True
            run.closed.append(span)
        run.root.end_ms = now
        run.root.attrs["hermes.llm_calls"] = run.llm_calls
        run.root.attrs["hermes.tool_calls"] = sum(1 for s in run.closed if s.attrs.get("span.type") == "tool_execution")
        return _build_otlp(run, _config()["allow_content"])

    def _evict_locked(self) -> None:
        if len(self._runs) < _MAX_RUNS:
            return
        oldest = min(self._runs, key=lambda k: self._runs[k].updated_at)
        self._runs.pop(oldest, None)


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


def _last_user_text(messages: Any) -> Optional[str]:
    if not isinstance(messages, (list, tuple)):
        return None
    for m in reversed(messages):
        if isinstance(m, dict) and m.get("role") == "user":
            text = _coerce_text(m.get("content"))
            if text.strip():
                return text
    return None


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
    if not isinstance(usage, dict):
        return
    pairs = [
        ("input_tokens", "gen_ai.usage.input_tokens"),
        ("output_tokens", "gen_ai.usage.output_tokens"),
        ("completion_tokens", "gen_ai.usage.output_tokens"),
        ("cache_read_tokens", "gen_ai.usage.cache_read.input_tokens"),
        ("cache_write_tokens", "gen_ai.usage.cache_creation.input_tokens"),
        ("reasoning_tokens", "gen_ai.usage.reasoning_tokens"),
        ("total_tokens", "gen_ai.usage.total_tokens"),
    ]
    for src, dst in pairs:
        v = usage.get(src)
        if isinstance(v, (int, float)) and v:
            span.attrs[dst] = int(v)


def _abandon(span: _Span, message: str, now: int) -> None:
    if span.end_ms is None:
        span.end_ms = now
    span.outcome = "error"
    span.error_message = message
    span.attrs["error.type"] = "abandoned"
    span.attrs["error.message"] = message
