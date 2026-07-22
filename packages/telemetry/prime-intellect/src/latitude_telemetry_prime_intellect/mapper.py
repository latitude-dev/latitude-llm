"""Map a Verifiers Trace (object or JSON dict) to an OTLP run + optional scores."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .messages import (
    _first_user_text,
    _message_role,
    _normalize_message,
    _normalize_messages,
    _system_prompt_from_messages,
    _tool_result,
)
from .model import _Run, _Span
from .otlp import _build_otlp
from .util import _get, _normalize_trace_id, _now_ms, _safe_json, _sec_to_ms, _span_id


def map_trace(
    trace: Any,
    *,
    allow_content: bool,
    export_scores: bool,
    session_id: Optional[str] = None,
    env: Optional[str] = None,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    run = _map_trace_to_run(trace, session_id=session_id, env=env)
    otlp = _build_otlp(run, allow_content)
    scores = run.score_payloads if export_scores else []
    return otlp, scores


def _map_trace_to_run(
    trace: Any,
    *,
    session_id: Optional[str] = None,
    env: Optional[str] = None,
) -> _Run:
    trace_id = _normalize_trace_id(_get(trace, "id"))
    messages = _main_branch_messages(trace)
    calls = list(_get(trace, "calls") or [])
    timing = _get(trace, "timing")
    start_ms = _sec_to_ms(_get(timing, "start"), _now_ms())
    end_ms = _trace_end_ms(trace, start_ms)

    resolved_session = session_id or _session_id(trace) or trace_id
    task = _get(trace, "task")
    task_type = _get(task, "type") or ""
    task_data = _get(task, "data")
    task_idx = _get(task_data, "idx")
    task_name = _get(task_data, "name")
    agent = _get(trace, "agent")
    model = _get(agent, "model")
    harness = _get(agent, "harness")
    harness_type = _get(harness, "type") or _get(harness, "name")
    rewards = dict(_get(trace, "rewards") or {})
    metrics = dict(_get(trace, "metrics") or {})
    info = dict(_get(trace, "info") or {})
    ok = bool(_get(trace, "ok", False))
    stop_condition = _get(trace, "stop_condition")
    error = _get(trace, "error") or (_get(trace, "errors") or [None])[-1]

    metadata: Dict[str, Any] = {
        "verifiers.trace.id": trace_id,
        "verifiers.ok": ok,
    }
    if env:
        metadata["verifiers.env"] = env
    if task_type:
        metadata["verifiers.task.type"] = task_type
    if task_idx is not None:
        metadata["verifiers.task.idx"] = task_idx
    if task_name:
        metadata["verifiers.task.name"] = task_name
    if model:
        metadata["verifiers.model"] = model
    if harness_type:
        metadata["verifiers.harness"] = harness_type
    if stop_condition:
        metadata["verifiers.stop_condition"] = stop_condition
    if rewards:
        metadata["verifiers.rewards"] = rewards
    if metrics:
        metadata["verifiers.metrics"] = metrics
    if info:
        metadata["verifiers.info"] = info

    tags = ["prime-intellect", "verifiers"]
    if env:
        tags.append(f"env:{env}")
    if task_type:
        tags.append(f"task:{task_type}")

    system_prompt = _system_prompt_from_messages(messages)
    first_user = _first_user_text(messages)
    normalized = _normalize_messages(messages)
    input_msgs = [m for m in normalized if m.get("role") in {"system", "user"}]
    output_msgs = [m for m in normalized if m.get("role") == "assistant"]

    root_attrs: Dict[str, Any] = {
        "span.type": "interaction",
        "interaction.kind": "eval",
        "session.id": resolved_session,
        "gen_ai.session.id": resolved_session,
        "latitude.tags": tags,
        "latitude.metadata": metadata,
        "verifiers.ok": ok,
        "verifiers.reward": float(sum(rewards.values())) if rewards else None,
    }
    if model:
        root_attrs["model"] = model
        root_attrs["gen_ai.request.model"] = model
    if system_prompt:
        root_attrs["gen_ai.system_instructions:gated"] = [{"type": "text", "content": system_prompt}]
    if first_user:
        root_attrs["user_prompt:gated"] = first_user
    if input_msgs:
        root_attrs["gen_ai.input.messages:gated"] = input_msgs
    if output_msgs:
        root_attrs["gen_ai.output.messages:gated"] = output_msgs[-1:]

    root = _Span(
        trace_id=trace_id,
        span_id=_span_id(),
        parent_span_id="",
        name="interaction",
        start_ms=start_ms,
        end_ms=end_ms,
        attrs=root_attrs,
        outcome="error" if not ok else "ok",
        error_message=_error_message(error) if not ok else None,
    )

    closed: List[_Span] = []
    closed.extend(_llm_spans(trace_id, root.span_id, calls, messages, tags, metadata, model))
    closed.extend(_tool_spans(trace_id, root.span_id, messages, tags, metadata, start_ms, end_ms))

    run = _Run(trace_id=trace_id, root=root, closed=closed)
    if rewards:
        run.score_payloads.extend(_score_payloads(trace_id, resolved_session, rewards, ok, metrics))
    elif metrics:
        # No named rewards — still surface a pass/fail score from ok + primary metric if present.
        primary = next(iter(metrics.items()), None)
        if primary is not None:
            name, value = primary
            run.score_payloads.append(
                _score_body(
                    trace_id=trace_id,
                    session_id=resolved_session,
                    source_id=f"verifiers.metric.{name}",
                    value=_clamp01(float(value)),
                    passed=ok,
                    feedback=f"Verifiers metric {name}={value}; ok={ok}",
                    metadata={"verifiers.metrics": metrics},
                )
            )
    return run


def _main_branch_messages(trace: Any) -> List[Any]:
    try:
        branches = getattr(trace, "branches", None)
        if callable(branches):
            branches = branches()
        elif branches is None and not isinstance(trace, dict):
            branches = None
        if branches:
            last = branches[-1]
            msgs = getattr(last, "messages", None)
            if callable(msgs):
                msgs = msgs()
            elif msgs is None:
                msgs = _get(last, "messages")
            if isinstance(msgs, (list, tuple)) and msgs:
                return list(msgs)
    except Exception:
        pass

    nodes = list(_get(trace, "nodes") or [])
    if not nodes:
        return []
    parents = {_get(n, "parent") for n in nodes if _get(n, "parent") is not None}
    leaf_idxs = [i for i in range(len(nodes)) if i not in parents]
    leaf = leaf_idxs[-1] if leaf_idxs else len(nodes) - 1
    path: List[int] = []
    cur: Optional[int] = leaf
    seen: set[int] = set()
    while cur is not None and cur not in seen:
        seen.add(cur)
        path.append(cur)
        cur = _get(nodes[cur], "parent")
    path.reverse()
    return [_get(nodes[i], "message") for i in path if _get(nodes[i], "message") is not None]


def _llm_spans(
    trace_id: str,
    parent_span_id: str,
    calls: List[Any],
    messages: List[Any],
    tags: List[str],
    metadata: Dict[str, Any],
    default_model: Any,
) -> List[_Span]:
    spans: List[_Span] = []
    for index, call in enumerate(calls):
        call_time = _get(call, "time")
        start_ms = _sec_to_ms(_get(call_time, "start"), _now_ms())
        end_ms = _sec_to_ms(_get(call_time, "end"), start_ms)
        model = _get(call, "model") or default_model
        finish = _get(call, "finish_reason")
        usage = _get(call, "usage")
        error = _get(call, "error")
        node_idx = _get(call, "node")

        input_msgs, output_msg = _messages_for_call(messages, node_idx, index, calls)

        attrs: Dict[str, Any] = {
            "span.type": "llm_request",
            "gen_ai.operation.name": "chat",
            "llm_request.call_index": index,
            "latitude.tags": tags,
            "latitude.metadata": metadata,
            "session.id": metadata.get("verifiers.trace.id"),
        }
        if model:
            attrs["model"] = model
            attrs["gen_ai.request.model"] = model
            attrs["gen_ai.response.model"] = model
        if finish:
            attrs["gen_ai.response.finish_reasons"] = [finish]
        if input_msgs:
            attrs["gen_ai.input.messages:gated"] = input_msgs
        if output_msg:
            attrs["gen_ai.output.messages:gated"] = [output_msg]
        _apply_usage(attrs, usage)
        endpoint = _get(call, "endpoint")
        if endpoint:
            attrs["verifiers.endpoint"] = endpoint

        span = _Span(
            trace_id=trace_id,
            span_id=_span_id(),
            parent_span_id=parent_span_id,
            name="llm_request",
            start_ms=start_ms,
            end_ms=end_ms,
            attrs=attrs,
            outcome="error" if error else "ok",
            error_message=_error_message(error),
        )
        spans.append(span)
    return spans


def _messages_for_call(
    messages: List[Any],
    node_idx: Any,
    call_index: int,
    calls: List[Any],
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    if isinstance(node_idx, int) and 0 <= node_idx < len(messages):
        # When messages are the full branch, node_idx is into Trace.nodes — not messages.
        # Fall through to prefix-by-call-index heuristic using assistant turns.
        pass

    assistant_indexes = [i for i, m in enumerate(messages) if _message_role(m) == "assistant"]
    if call_index < len(assistant_indexes):
        aidx = assistant_indexes[call_index]
        input_raw = messages[:aidx]
        output_raw = messages[aidx]
        return _normalize_messages(input_raw), _normalize_message(output_raw)

    # No assistant alignment — dump all messages as input for the first call only.
    if call_index == 0:
        return _normalize_messages(messages), None
    return [], None


def _tool_spans(
    trace_id: str,
    parent_span_id: str,
    messages: List[Any],
    tags: List[str],
    metadata: Dict[str, Any],
    start_ms: int,
    end_ms: int,
) -> List[_Span]:
    spans: List[_Span] = []
    pending_calls: Dict[str, Dict[str, Any]] = {}

    for m in messages:
        role = _message_role(m)
        if role == "assistant":
            tool_calls = _get(m, "tool_calls") if not isinstance(m, dict) else m.get("tool_calls")
            if not isinstance(tool_calls, (list, tuple)):
                continue
            for tc in tool_calls:
                fn = _get(tc, "function")
                name = _get(fn, "name") if fn is not None else _get(tc, "name")
                args = _get(fn, "arguments") if fn is not None else _get(tc, "arguments")
                if isinstance(args, str):
                    try:
                        import json

                        args = json.loads(args)
                    except Exception:
                        pass
                tc_id = str(_get(tc, "id") or "")
                pending_calls[tc_id or f"anon-{len(pending_calls)}"] = {
                    "name": name or "unknown",
                    "arguments": args if args is not None else {},
                    "id": tc_id,
                }
        elif role == "tool":
            tc_id = str((_get(m, "tool_call_id") if not isinstance(m, dict) else m.get("tool_call_id")) or "")
            pending = pending_calls.pop(tc_id, None) if tc_id else None
            if pending is None and pending_calls:
                first_key = next(iter(pending_calls))
                pending = pending_calls.pop(first_key)
            name = (_get(m, "name") if not isinstance(m, dict) else m.get("name")) or (
                pending["name"] if pending else "unknown"
            )
            content = _get(m, "content") if not isinstance(m, dict) else m.get("content")
            spans.append(
                _Span(
                    trace_id=trace_id,
                    span_id=_span_id(),
                    parent_span_id=parent_span_id,
                    name=f"tool_call:{name}",
                    start_ms=start_ms,
                    end_ms=end_ms,
                    attrs={
                        "span.type": "tool_execution",
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.tool.name": name,
                        "gen_ai.tool.call.id": tc_id or (pending["id"] if pending else None),
                        "gen_ai.tool.call.arguments:gated": pending["arguments"] if pending else None,
                        "gen_ai.tool.call.result:gated": _tool_result(content),
                        "latitude.tags": tags,
                        "latitude.metadata": metadata,
                        "success": "true",
                    },
                )
            )
    return spans


def _apply_usage(attrs: Dict[str, Any], usage: Any) -> None:
    if usage is None:
        return
    prompt = _get(usage, "prompt_tokens")
    completion = _get(usage, "completion_tokens")
    cached = _get(usage, "cached_input_tokens")
    reasoning = _get(usage, "reasoning_tokens")
    if isinstance(prompt, (int, float)):
        attrs["gen_ai.usage.input_tokens"] = int(prompt)
    if isinstance(completion, (int, float)):
        attrs["gen_ai.usage.output_tokens"] = int(completion)
    if isinstance(cached, (int, float)) and cached:
        attrs["gen_ai.usage.cache_read.input_tokens"] = int(cached)
    if isinstance(reasoning, (int, float)) and reasoning:
        attrs["gen_ai.usage.reasoning_tokens"] = int(reasoning)
    if isinstance(prompt, (int, float)) and isinstance(completion, (int, float)):
        attrs["gen_ai.usage.total_tokens"] = int(prompt) + int(completion)


def _session_id(trace: Any) -> Optional[str]:
    run = _get(trace, "run")
    run_id = _get(run, "id")
    if isinstance(run_id, str) and run_id:
        return run_id
    return None


def _trace_end_ms(trace: Any, start_ms: int) -> int:
    timing = _get(trace, "timing")
    for key in ("scoring", "finalize", "generation"):
        span = _get(timing, key)
        end = _get(span, "end")
        if isinstance(end, (int, float)) and end > 0:
            return _sec_to_ms(end, start_ms)
    calls = list(_get(trace, "calls") or [])
    if calls:
        last_time = _get(calls[-1], "time")
        end = _get(last_time, "end")
        if isinstance(end, (int, float)) and end > 0:
            return _sec_to_ms(end, start_ms)
    return start_ms


def _error_message(error: Any) -> Optional[str]:
    if error is None:
        return None
    if isinstance(error, str):
        return error
    msg = _get(error, "message")
    typ = _get(error, "type")
    if msg and typ:
        return f"{typ}: {msg}"
    if msg:
        return str(msg)
    return _safe_json(error) or None


def _score_payloads(
    trace_id: str,
    session_id: str,
    rewards: Dict[str, Any],
    ok: bool,
    metrics: Dict[str, Any],
) -> List[Dict[str, Any]]:
    payloads: List[Dict[str, Any]] = []
    for name, raw in rewards.items():
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        payloads.append(
            _score_body(
                trace_id=trace_id,
                session_id=session_id,
                source_id=f"verifiers.reward.{name}",
                value=_clamp01(value),
                passed=ok if len(rewards) == 1 else value >= 0.5,
                feedback=f"Verifiers reward {name}={value}",
                metadata={"verifiers.rewards": rewards, "verifiers.metrics": metrics},
            )
        )
    return payloads


def _score_body(
    *,
    trace_id: str,
    session_id: str,
    source_id: str,
    value: float,
    passed: bool,
    feedback: str,
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    meta = dict(metadata)
    if session_id:
        meta.setdefault("verifiers.session.id", session_id)
    return {
        "trace": {"by": "id", "id": trace_id},
        "value": value,
        "passed": passed,
        "feedback": feedback,
        "sourceId": source_id[:64],
        "metadata": meta,
    }


def _clamp01(value: float) -> float:
    if value < 0:
        return 0.0
    if value > 1:
        return 1.0
    return value
