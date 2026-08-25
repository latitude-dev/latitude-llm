"""Span lifecycle: tool fidelity, retry/interruption semantics, TTFT, identity."""

from __future__ import annotations

from typing import Any, Dict, List

from helpers import by_name, span_attrs

import latitude_telemetry_hermes.builder as builder_module
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.model import _Span

_MESSAGES = [
    {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "ls"}]},
]

_TOOLS = [{"type": "function", "function": {"name": "terminal", "description": "run", "parameters": {}}}]


def _turn(**overrides: Any) -> Dict[str, Any]:
    payload = {
        "session_id": "sess-1",
        "task_id": "task-1",
        "turn_id": "turn-1",
        "api_request_id": "turn-1:api:1",
        "api_call_count": 1,
        "retry_count": 0,
        "platform": "cli",
        "model": "gpt-5.6-sol",
        "provider": "openai",
        "base_url": "https://api.openai.com",
        "api_mode": "codex_responses",
        "request_messages": _MESSAGES,
        "user_message": "ls",
        "system_prompt": "You are Hermes.",
        "tool_count": 1,
        "message_count": 1,
        "request": {"body": {"tools": _TOOLS}},
    }
    payload.update(overrides)
    return payload


def _post(**overrides: Any) -> Dict[str, Any]:
    payload = {
        "session_id": "sess-1",
        "task_id": "task-1",
        "turn_id": "turn-1",
        "api_request_id": "turn-1:api:1",
        "api_call_count": 1,
        "retry_count": 0,
        "model": "gpt-5.6-sol",
        "response_model": "gpt-5.6-sol-2026-07-09",
        "provider": "openai",
        "finish_reason": "stop",
        "assistant_message": {"content": "one file"},
        "assistant_content_chars": 8,
        "usage": {
            "input_tokens": 1356,
            "output_tokens": 634,
            "cache_read_tokens": 166528,
            "reasoning_tokens": 549,
            "total_tokens": 168518,
        },
    }
    payload.update(overrides)
    return payload


# --- M1/M2: what a normal turn exports -------------------------------------


def test_a_completed_turn_exports_system_prompt_tool_definitions_and_usage():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    spans = b.on_post_api_request(**_post())

    assert [s.name for s in spans] == ["llm_request", "interaction"], "the root ships last"

    call = span_attrs(spans, "llm_request")
    assert "You are Hermes." in call["gen_ai.system_instructions"]
    assert "terminal" in call["gen_ai.tool.definitions"]
    assert call["gen_ai.response.model"] == "gpt-5.6-sol-2026-07-09", "the real model, not the requested one"
    assert call["gen_ai.request.model"] == "gpt-5.6-sol"
    assert call["gen_ai.usage.input_tokens"] == 1356
    assert call["gen_ai.usage.output_tokens"] == 634, "output stays inclusive of reasoning"
    assert call["gen_ai.usage.total_tokens"] == 168518, "the total is the resolver's additive/inclusive proof"
    assert call["gen_ai.response.finish_reasons"] == ["stop"]

    root = span_attrs(spans, "interaction")
    assert root["user_prompt"] == "ls", "taken from user_message, never scanned out of history"
    assert "You are Hermes." in root["gen_ai.system_instructions"]
    assert root["hermes.llm_calls"] == 1
    assert root["interaction.kind"] == "user"
    assert root["service.instance.id"] == "sess-1"


def test_tool_definitions_are_skipped_when_hermes_truncated_the_request():
    b = _Builder()
    b.on_pre_api_request(**_turn(request={"_truncated": True, "preview": "…"}))
    spans = b.on_post_api_request(**_post())
    assert "gen_ai.tool.definitions" not in span_attrs(spans, "llm_request")
    assert span_attrs(spans, "llm_request")["hermes.tool_count"] == 1


def test_the_snapshot_is_used_whatever_the_calls_tool_count(monkeypatch):
    """Hermes narrows the toolset per call, so a call offering 22 tools against a
    22-tool… or 18-tool… equipped set is normal. Requiring an exact match left
    whole sessions with no definitions at all, silently."""
    snapshot = [{"name": "a"}, {"name": "b"}]
    monkeypatch.setattr("latitude_telemetry_hermes.tools.tool_definitions_snapshot", lambda: snapshot)

    b = _Builder()
    b.on_pre_api_request(**_turn(request=None, tool_count=22))
    call = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert '"name": "a"' in call["gen_ai.tool.definitions"]
    assert call["hermes.tool_definitions.source"] == "snapshot", "the imprecision is stated, not hidden"
    assert call["hermes.tool_count"] == 22, "the per-call truth is still on the span"


def test_the_request_payload_wins_over_the_snapshot(monkeypatch):
    monkeypatch.setattr("latitude_telemetry_hermes.tools.tool_definitions_snapshot", lambda: [{"name": "stale"}])
    b = _Builder()
    b.on_pre_api_request(**_turn())
    call = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert "terminal" in call["gen_ai.tool.definitions"]
    assert "stale" not in call["gen_ai.tool.definitions"]
    assert call["hermes.tool_definitions.source"] == "request"


def test_a_snapshot_never_overwrites_a_request_sourced_list(monkeypatch):
    monkeypatch.setattr("latitude_telemetry_hermes.tools.tool_definitions_snapshot", lambda: [{"name": "stale"}])
    b = _Builder()
    b.on_pre_api_request(**_turn())
    b.on_post_api_request(**_post())
    # a later call whose request payload Hermes truncated
    b.on_pre_api_request(**_turn(api_call_count=2, request={"_truncated": True}))
    call = span_attrs(b.on_post_api_request(**_post(api_call_count=2)), "llm_request")
    assert "terminal" in call["gen_ai.tool.definitions"]
    assert call["hermes.tool_definitions.source"] == "request"


def test_tool_definitions_disabled_by_config(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_TOOL_DEFINITIONS", "0")
    builder_module._config.__globals__["reset_config"]()
    b = _Builder()
    b.on_pre_api_request(**_turn())
    assert "gen_ai.tool.definitions" not in span_attrs(b.on_post_api_request(**_post()), "llm_request")


# --- M2: tool errors -------------------------------------------------------


def test_a_failed_tool_call_exports_the_real_status_and_message():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    b.on_pre_tool_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        tool_name="terminal",
        args={"cmd": "x"},
        tool_call_id="c1",
    )
    spans = b.on_post_tool_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        tool_name="terminal",
        tool_call_id="c1",
        args={"cmd": "x"},
        result={"error": "No such file"},
        status="error",
        error_type="tool_error",
        error_message="No such file",
        duration_ms=42,
    )
    attrs = span_attrs(spans, "tool_call:terminal")
    assert attrs["tool.is_error"] is True
    assert attrs["success"] == "false"
    assert attrs["error.type"] == "tool_error"
    assert attrs["error.message"] == "No such file"
    assert attrs["hermes.tool.duration_ms"] == 42, "Hermes already measured it"
    assert by_name(spans)["tool_call:terminal"].kind == 3


def test_a_successful_tool_call_is_not_reported_as_an_error():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    b.on_pre_tool_call(session_id="sess-1", task_id="task-1", turn_id="turn-1", tool_name="terminal", tool_call_id="c1")
    spans = b.on_post_tool_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        tool_name="terminal",
        tool_call_id="c1",
        result="README.md",
        status="ok",
        duration_ms=7,
    )
    attrs = span_attrs(spans, "tool_call:terminal")
    assert attrs["tool.is_error"] is False
    assert attrs["gen_ai.tool.call.result"] == "README.md"


# --- M3: retries, errors, interruptions ------------------------------------


def test_a_retried_attempt_exports_a_real_error_not_abandoned():
    b = _Builder()
    b.on_pre_api_request(**_turn(retry_count=0))
    failed = b.on_api_request_error(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        api_call_count=1,
        retry_count=0,
        status_code=429,
        retryable=True,
        reason="rate_limit",
        max_retries=5,
        error={"type": "RateLimitError", "message": "slow down"},
    )
    b.on_pre_api_request(**_turn(retry_count=1))
    ok = b.on_post_api_request(**_post(retry_count=1))

    attrs = span_attrs(failed, "llm_request")
    assert attrs["error.type"] == "rate_limit"
    assert attrs["error.type"] != "abandoned"
    assert attrs["hermes.error.status_code"] == 429
    assert attrs["hermes.error.retryable"] is True
    assert attrs["hermes.retry_count"] == 0

    assert len(failed) == 1 and [s.name for s in ok] == ["llm_request", "interaction"]
    assert span_attrs(ok, "llm_request")["hermes.retry_count"] == 1


def test_an_interrupted_turn_produces_no_error_span():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    spans = b.finish_scoped(session_id="sess-1", completed=False, interrupted=True, reason="user_interrupt")

    call = by_name(spans)["llm_request"]
    assert call.outcome == "ok", "a turn the user cut short is cancelled, not failed"
    assert "error.type" not in call.attrs
    assert call.attrs["hermes.span.closed_reason"] == "turn_interrupted"
    assert call.attrs["hermes.usage.state"] == "unreported", "the provider may still have billed it"

    root = by_name(spans)["interaction"]
    assert root.outcome == "ok"
    assert root.attrs["hermes.turn.outcome"] == "interrupted"
    assert root.attrs["hermes.llm_calls_unreported"] == 1


def test_a_failed_turn_keeps_an_error_status():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    spans = b.finish_scoped(session_id="sess-1", completed=False, failed=True, turn_exit_reason="max_iterations")
    root = by_name(spans)["interaction"]
    assert root.outcome == "error"
    assert root.attrs["error.type"] == "turn_failed"
    assert root.attrs["hermes.turn.exit_reason"] == "max_iterations"


def test_no_dead_completion_tokens_mapping():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    spans = b.on_post_api_request(**_post(usage={"output_tokens": 10, "completion_tokens": 999}))
    assert span_attrs(spans, "llm_request")["gen_ai.usage.output_tokens"] == 10


# --- M4: TTFT, identity, cost ----------------------------------------------


def test_ttft_is_measured_from_the_first_delta():
    b = _Builder()
    b.on_stream_start(turn_id="turn-1", iteration=1, session_id="sess-1")
    b.on_pre_api_request(**_turn())
    b.on_stream_delta(turn_id="turn-1", iteration=1, delta="he", kind="text")
    spans = b.on_post_api_request(**_post())

    attrs = span_attrs(spans, "llm_request")
    assert attrs["gen_ai.request.stream"] is True
    assert attrs["gen_ai.server.time_to_first_token"] >= 0


def test_an_implausible_ttft_is_dropped():
    b = _Builder()
    b.on_stream_start(turn_id="turn-1", iteration=1, session_id="sess-1")
    b.on_pre_api_request(**_turn())
    b.on_stream_delta(turn_id="turn-1", iteration=1, delta="he", kind="text")
    b._streams[("turn-1", "1")].first_delta_ms += 10_000  # observed long after the span closed
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert "gen_ai.server.time_to_first_token" not in attrs
    assert attrs["gen_ai.request.stream"] is True


def test_a_stream_that_ends_unfinished_is_recorded():
    b = _Builder()
    b.on_stream_start(turn_id="turn-1", iteration=1, session_id="sess-1")
    b.on_pre_api_request(**_turn())
    b.on_stream_end(turn_id="turn-1", iteration=1, final_text="", finished=False, error="connection reset")
    assert span_attrs(b.on_post_api_request(**_post()), "llm_request")["hermes.stream.error"] == "connection reset"


def test_the_route_reaches_metadata_even_when_the_turn_was_framed_first():
    """pre_llm_call opens the run and carries no provider/base_url/api_mode, so a
    run built from it alone silently dropped all three."""
    b = _Builder()
    b.on_pre_llm_call(session_id="sess-1", task_id="task-1", turn_id="turn-1", user_message="ls", platform="cli")
    b.on_pre_api_request(**_turn())
    metadata = span_attrs(b.on_post_api_request(**_post()), "llm_request")["latitude.metadata"]
    assert '"hermes.api_mode": "codex_responses"' in metadata
    assert '"hermes.provider": "openai"' in metadata
    assert '"hermes.base_url": "https://api.openai.com"' in metadata


def test_a_self_referential_parent_session_is_not_recorded():
    """Hermes passes the session's own id as `parent_session_id` on some paths;
    recording it as lineage is noise."""
    b = _Builder()
    b.on_pre_llm_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        user_message="hi",
        parent_session_id="sess-1",
    )
    b.on_pre_api_request(**_turn())
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert "hermes.parent_session_id" not in attrs["latitude.metadata"]


def test_an_email_shaped_sender_id_is_also_exported_as_an_email():
    """Some Hermes platforms use the address as the user id; Latitude has a field
    for it, and an address reads better than a raw handle."""
    b = _Builder()
    b.on_pre_llm_call(
        session_id="sess-1", task_id="task-1", turn_id="turn-1", user_message="hi", sender_id="alex@latitude.so"
    )
    b.on_pre_api_request(**_turn())
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert attrs["user.id"] == "alex@latitude.so"
    assert attrs["user.email"] == "alex@latitude.so"


def test_a_platform_handle_is_not_mistaken_for_an_email():
    b = _Builder()
    b.on_pre_llm_call(
        session_id="sess-1", task_id="task-1", turn_id="turn-1", user_message="hi", sender_id="U07UYTQP04Q"
    )
    b.on_pre_api_request(**_turn())
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert attrs["user.id"] == "U07UYTQP04Q"
    assert "user.email" not in attrs


def test_sender_id_becomes_the_latitude_user_id():
    b = _Builder()
    b.on_pre_llm_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        user_message="hi",
        model="gpt-5.6-sol",
        platform="slack",
        sender_id="U07UYTQP04Q",
        parent_session_id="parent-1",
    )
    b.on_pre_api_request(**_turn(platform="slack"))
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert attrs["user.id"] == "U07UYTQP04Q"
    assert "parent-1" in attrs["latitude.metadata"]


def test_cost_is_only_exported_when_hermes_reports_an_actual_figure(monkeypatch):
    included = {
        "amount": 0.0,
        "status": "included",
        "label": "included",
        "billing_mode": "subscription_included",
        "provider": "openai-codex",
    }
    monkeypatch.setattr(builder_module, "estimate_cost", lambda *a, **k: included)
    b = _Builder()
    b.on_pre_api_request(**_turn())
    attrs = span_attrs(b.on_post_api_request(**_post()), "llm_request")
    assert "gen_ai.usage.cost" not in attrs, "an included route must not claim a zero cost"
    assert attrs["hermes.cost.status"] == "included"
    assert attrs["hermes.billing.mode"] == "subscription_included"
    assert attrs["hermes.provider.raw"] == "openai-codex", "the raw route, which resolveProviderName folds away"

    actual = {"amount": 1.25, "status": "actual", "label": "$1.25", "billing_mode": "api_key", "provider": "openai"}
    monkeypatch.setattr(builder_module, "estimate_cost", lambda *a, **k: actual)
    b2 = _Builder()
    b2.on_pre_api_request(**_turn(session_id="sess-2"))
    attrs2 = span_attrs(b2.on_post_api_request(**_post(session_id="sess-2")), "llm_request")
    assert attrs2["gen_ai.usage.cost"] == 1.25


# --- M6: subagents ---------------------------------------------------------


def _delegating_turn(b: _Builder) -> List[_Span]:
    b.on_pre_api_request(**_turn())
    b.on_pre_tool_call(
        session_id="sess-1",
        task_id="task-1",
        turn_id="turn-1",
        tool_name="delegate",
        tool_call_id="d1",
        args={"goal": "research"},
    )
    b.on_subagent_start(
        parent_session_id="sess-1",
        parent_turn_id="turn-1",
        child_session_id="child-1",
        child_subagent_id="sa-9",
        child_role="researcher",
        child_goal="research the thing",
    )
    return b.on_pre_api_request(
        **_turn(session_id="child-1", task_id="child-task", turn_id="child-turn", user_message="")
    )


def test_a_delegated_child_joins_the_parent_trace_and_session():
    b = _Builder()
    _delegating_turn(b)
    child = b._runs[next(k for k, run in b._runs.items() if run.session_id == "child-1")]
    parent = b._runs[next(k for k, run in b._runs.items() if run.session_id == "sess-1")]

    assert child.trace_id == parent.trace_id, "one delegation is one trace tree"
    assert child.reported_session_id == "sess-1", "and one Latitude session"
    assert child.root.parent_span_id == parent.open_tools["d1"].span_id
    assert child.root.attrs["interaction.kind"] == "subagent"
    assert child.root.attrs["gen_ai.agent.name"] == "researcher"
    assert child.root.attrs["subagent.id"] == "researcher:sa-9"
    assert child.root.attrs["user_prompt:gated"] == "research the thing"

    finished = b.finish_scoped(session_id="sess-1", completed=True)
    assert "subagent:researcher" in span_attrs(finished, "interaction")["latitude.tags"]


def test_a_subagent_carries_the_parent_session_identity_not_its_own():
    """The child reports `platform="subagent"` and its own session id. Minting a
    context from those pollutes the session's tag and metadata rollups, which are
    argMax'd over every span — the session would read as a subagent's."""
    b = _Builder()
    _delegating_turn(b)
    child = next(run for run in b._runs.values() if run.session_id == "child-1")
    tags = child.root.attrs["latitude.tags"]
    metadata = child.root.attrs["latitude.metadata"]

    assert "subagent" not in tags, "the child's platform is not a platform tag"
    assert tags[:2] == ["hermes", "cli"], "the parent's platform survives"
    assert metadata["hermes.session.id"] == "sess-1", "the session is the parent's"
    assert metadata["hermes.platform"] == "cli"
    assert metadata["hermes.subagent.session_id"] == "child-1", "the child's own id is kept aside"
    assert metadata["hermes.subagent.role"] == "researcher"


def test_subagent_stop_records_the_outcome_and_clears_the_registry():
    b = _Builder()
    _delegating_turn(b)
    b.on_subagent_stop(
        parent_session_id="sess-1",
        parent_turn_id="turn-1",
        child_session_id="child-1",
        child_role="researcher",
        child_status="completed",
        child_summary="found it",
        duration_ms=4200,
        tool_call_history=[{"name": "search"}],
    )
    child = next(run for run in b._runs.values() if run.session_id == "child-1")
    assert child.root.attrs["hermes.subagent.status"] == "completed"
    assert child.root.attrs["hermes.subagent.summary:gated"] == "found it"
    assert child.root.attrs["hermes.subagent.duration_ms"] == 4200
    assert "child-1" not in b._subagents, "the registry entry is released"


# --- M7: eviction ----------------------------------------------------------


def test_eviction_ships_the_evicted_run_instead_of_dropping_it(monkeypatch):
    monkeypatch.setattr(builder_module, "_MAX_RUNS", 2)
    b = _Builder()
    b.on_pre_api_request(**_turn(session_id="a", turn_id="ta"))
    b.on_pre_api_request(**_turn(session_id="b", turn_id="tb"))
    shipped = b.on_pre_api_request(**_turn(session_id="c", turn_id="tc"))
    assert "interaction" in {s.name for s in shipped}, "the evicted turn is finalized and handed over"
    assert len(b._runs) == 2


# --- M11: background runs --------------------------------------------------


def _run_on_thread(b: _Builder, name: str, **overrides: Any) -> Any:
    import threading

    thread = threading.Thread(target=lambda: b.on_pre_api_request(**_turn(**overrides)), name=name)
    thread.start()
    thread.join()
    return next(run for run in b._runs.values() if run.turn_id == overrides["turn_id"])


def test_an_ordinary_turn_is_never_labelled_background():
    """Hermes runs *every* turn on its own `Thread-N (run_agent)` worker, so
    thread identity says nothing about whether a run is a background fork."""
    b = _Builder()
    b.on_pre_api_request(**_turn())
    later = _run_on_thread(b, "Thread-97 (run_agent)", turn_id="turn-2", api_request_id="turn-2:api:1")
    assert later.root.attrs["interaction.kind"] == "user"
    assert later.root.attrs["hermes.thread.name"] == "Thread-97 (run_agent)"


def test_only_the_named_review_thread_is_background():
    """`bg-review` is the name Hermes gives the background-review fork."""
    b = _Builder()
    b.on_pre_api_request(**_turn())
    review = _run_on_thread(b, "bg-review", turn_id="turn-review", api_request_id="turn-review:api:1")
    assert review.root.attrs["interaction.kind"] == "background"
