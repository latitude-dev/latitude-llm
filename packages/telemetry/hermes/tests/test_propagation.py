"""Cross-harness trace correlation: joining a parent's trace, and publishing ours.

A harness that launches another one hands over a W3C traceparent; the child joins
that trace instead of rooting its own. Everything here is that contract in both
directions.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Dict

import pytest

from latitude_telemetry_hermes import hooks, propagation
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.config import reset_config
from latitude_telemetry_hermes.propagation import (
    MAX_INHERITED_TURNS,
    ChildContext,
    child_env,
    format_traceparent,
    inherited_context,
    inherited_session_id,
    inherited_traceparent,
    parse_traceparent,
)

TRACE = "4bf92f3577b34da6a3ce929d0e0e4736"
SPAN = "00f067aa0ba902b7"
HEADER = f"00-{TRACE}-{SPAN}-01"

_MESSAGES = [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "ls"}]}]

_OTHER_CONTEXT = ChildContext(
    traceparent=f"00-0af7651916cd43dd8448eb211c80319c-{SPAN}-01",
    session_id="other-session",
    project="other-project",
)


def _turn(**overrides: Any) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "session_id": "sess-1",
        "task_id": "task-1",
        "turn_id": "turn-1",
        "api_request_id": "turn-1:api:1",
        "api_call_count": 1,
        "retry_count": 0,
        "platform": "cli",
        "model": "gpt-5.6-sol",
        "provider": "openai",
        "request_messages": _MESSAGES,
        "user_message": "ls",
    }
    payload.update(overrides)
    return payload


# --- the header itself ------------------------------------------------------


def test_a_well_formed_header_parses():
    assert parse_traceparent(HEADER) == (TRACE, SPAN)


def test_a_future_version_keeps_its_trailing_fields_to_itself():
    assert parse_traceparent(f"01-{TRACE}-{SPAN}-01-extra") == (TRACE, SPAN)


def test_version_00_rejects_trailing_fields():
    assert parse_traceparent(f"00-{TRACE}-{SPAN}-01-extra") is None


@pytest.mark.parametrize(
    "header",
    [
        f"ff-{TRACE}-{SPAN}-01",
        f"00-{'0' * 32}-{SPAN}-01",
        f"00-{TRACE}-{'0' * 16}-01",
        f"00-{TRACE}-{SPAN}",
        "00-short-00f067aa0ba902b7-01",
        # `$` also matches before a trailing newline, so these pass a `match` check.
        f"00-{TRACE}\n-{SPAN}-01",
        f"00-{TRACE}-{SPAN}\n-01",
        "garbage",
        "",
        None,
    ],
)
def test_a_malformed_header_is_ignored(header):
    assert parse_traceparent(header) is None


def test_format_round_trips():
    assert parse_traceparent(format_traceparent(TRACE, SPAN)) == (TRACE, SPAN)


def test_the_latitude_scoped_variable_wins_over_an_unrelated_pipelines(monkeypatch):
    other = "0af7651916cd43dd8448eb211c80319c"
    monkeypatch.setenv("TRACEPARENT", f"00-{other}-{SPAN}-01")
    monkeypatch.setenv("LATITUDE_TRACEPARENT", HEADER)
    context = inherited_context()
    assert context is not None and context.trace_id == TRACE


# --- joining a parent's trace ----------------------------------------------


def test_an_empty_scoped_variable_opts_out_of_an_unrelated_pipelines(monkeypatch):
    # Precedence is by presence, not truthiness: emptying the scoped variable is how a
    # pipeline that already sets TRACEPARENT for something else keeps Hermes out of it.
    monkeypatch.setenv("TRACEPARENT", HEADER)
    monkeypatch.setenv("LATITUDE_TRACEPARENT", "")
    assert inherited_context() is None


def test_a_turn_joins_the_trace_it_was_launched_under(monkeypatch):
    monkeypatch.setenv("TRACEPARENT", HEADER)
    reset_config()
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.trace_id == TRACE
    assert run.root.parent_span_id == SPAN
    assert run.root.trace_id == TRACE


def test_a_turn_roots_its_own_trace_when_launched_alone():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.trace_id != TRACE
    assert run.root.parent_span_id == ""


def test_an_inherited_session_id_becomes_the_reported_one(monkeypatch):
    monkeypatch.setenv("TRACEPARENT", HEADER)
    monkeypatch.setenv("LATITUDE_SESSION_ID", "hermes-parent-session")
    reset_config()
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.reported_session_id == "hermes-parent-session"
    # Hermes's own session id stays reachable as a filter rather than being replaced.
    assert run.extra_metadata["hermes.session.id"] == "sess-1"


def test_the_parent_span_is_recorded_as_metadata(monkeypatch):
    monkeypatch.setenv("TRACEPARENT", HEADER)
    reset_config()
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.extra_metadata["latitude.parent.trace_id"] == TRACE
    assert run.extra_metadata["latitude.parent.span_id"] == SPAN


def test_joining_stops_at_the_ceiling(monkeypatch):
    monkeypatch.setenv("TRACEPARENT", HEADER)
    reset_config()
    b = _Builder()
    b._inherited_turns = MAX_INHERITED_TURNS
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.trace_id != TRACE
    assert run.root.parent_span_id == ""


def test_the_shared_session_survives_the_ceiling(monkeypatch):
    # Past the ceiling a turn roots its own trace, which is exactly when the shared
    # session id is the only thing still grouping it with the parent harness.
    monkeypatch.setenv("TRACEPARENT", HEADER)
    monkeypatch.setenv("LATITUDE_SESSION_ID", "hermes-parent-session")
    reset_config()
    b = _Builder()
    b._inherited_turns = MAX_INHERITED_TURNS
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.trace_id != TRACE
    assert run.reported_session_id == "hermes-parent-session"


def test_the_shared_session_applies_without_a_traceparent(monkeypatch):
    monkeypatch.setenv("LATITUDE_SESSION_ID", "hermes-parent-session")
    reset_config()
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    assert run.reported_session_id == "hermes-parent-session"
    assert run.extra_metadata["hermes.session.id"] == "sess-1"


def test_the_session_id_is_read_independently_of_the_header(monkeypatch):
    monkeypatch.setenv("LATITUDE_SESSION_ID", "  hermes-parent-session  ")
    assert inherited_session_id() == "hermes-parent-session"
    monkeypatch.delenv("LATITUDE_SESSION_ID")
    assert inherited_session_id() == ""


def test_inheritance_can_be_turned_off(monkeypatch):
    monkeypatch.setenv("TRACEPARENT", HEADER)
    monkeypatch.setenv("LATITUDE_HERMES_INHERIT_CONTEXT", "0")
    reset_config()
    b = _Builder()
    b.on_pre_api_request(**_turn())

    assert next(iter(b._runs.values())).trace_id != TRACE


# --- publishing our context to a child -------------------------------------


def test_child_context_anchors_on_the_tool_span_that_is_launching_it():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    b.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1", args={"cmd": "claude"}))
    run = next(iter(b._runs.values()))
    tool_span = run.open_tools["call-1"]

    context = b.child_context(**_turn(tool_call_id="call-1"))

    assert context is not None
    # Under the tool invocation, not beside it under the turn — that edge is what
    # proves the child was launched by this specific tool call.
    assert context.traceparent == format_traceparent(run.trace_id, tool_span.span_id)
    assert context.session_id == run.reported_session_id
    assert context.project == "test-project"


def test_child_context_falls_back_to_the_turn_when_no_tool_is_open():
    b = _Builder()
    b.on_pre_api_request(**_turn())
    run = next(iter(b._runs.values()))

    context = b.child_context(**_turn())

    assert context is not None
    assert context.traceparent == format_traceparent(run.trace_id, run.root.span_id)


def test_child_context_is_absent_outside_a_turn():
    assert _Builder().child_context(**_turn()) is None


def test_child_env_carries_trace_session_and_project(monkeypatch):
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))

    env = propagation.child_env({})
    assert env["TRACEPARENT"].startswith("00-")
    assert env["LATITUDE_SESSION_ID"] == "sess-1"
    # Ingest is project-scoped: without this the child's spans land in another
    # project and the trace silently splits in two.
    assert env["LATITUDE_PROJECT"] == "test-project"

    hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))
    assert "TRACEPARENT" not in propagation.child_env({})


def test_environ_export_is_opt_in(monkeypatch):
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
    try:
        assert "TRACEPARENT" not in os.environ
    finally:
        hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))


def test_environ_export_scopes_the_variables_to_the_tool_call(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_EXPORT_TRACEPARENT", "1")
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    try:
        hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
        assert parse_traceparent(os.environ["TRACEPARENT"]) is not None
        assert os.environ["LATITUDE_SESSION_ID"] == "sess-1"
    finally:
        hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))

    assert "TRACEPARENT" not in os.environ


def test_environ_export_restores_a_pre_existing_value(monkeypatch):
    outer = f"00-0af7651916cd43dd8448eb211c80319c-{SPAN}-01"
    monkeypatch.setenv("TRACEPARENT", outer)
    monkeypatch.setenv("LATITUDE_HERMES_EXPORT_TRACEPARENT", "1")
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
    assert os.environ["TRACEPARENT"] != outer
    hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))

    assert os.environ["TRACEPARENT"] == outer


def test_a_concurrent_tool_call_does_not_take_over_the_exported_environment(monkeypatch):
    # os.environ is process-wide while turns run on their own threads. One owner at a
    # time, so a sibling call cannot clear this call's variables or restore them to
    # its own values once both finish.
    monkeypatch.setenv("LATITUDE_HERMES_EXPORT_TRACEPARENT", "1")
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
    mine = os.environ["TRACEPARENT"]

    sibling = threading.Thread(target=lambda: hooks._export_to_environ(_OTHER_CONTEXT))
    sibling.start()
    sibling.join()
    try:
        assert os.environ["TRACEPARENT"] == mine
    finally:
        hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))

    assert "TRACEPARENT" not in os.environ


def test_an_unpaired_export_is_restored_by_the_next_one(monkeypatch):
    # A tool call that errors out never reaches post_tool_call. The next export must
    # capture the original values, not the abandoned call's, or the restore leaks them.
    outer = f"00-0af7651916cd43dd8448eb211c80319c-{SPAN}-01"
    monkeypatch.setenv("TRACEPARENT", outer)
    monkeypatch.setenv("LATITUDE_HERMES_EXPORT_TRACEPARENT", "1")
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-2"))
    hooks.on_post_tool_call(**_turn(tool_call_id="call-2", status="ok"))

    assert os.environ["TRACEPARENT"] == outer


def test_an_unpaired_tool_call_does_not_leave_a_stale_parent():
    # A tool that errors out can skip post_tool_call. The next retract must clear the
    # context rather than restore the earlier tool's span — handing a child the wrong
    # parent is worse than handing it none.
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-2"))
    hooks.on_post_tool_call(**_turn(tool_call_id="call-2", status="ok"))

    assert propagation.current_traceparent() is None


# --- a stale scoped variable must not outrank what we publish -----------------

STALE = f"00-{'1' * 32}-{'2' * 16}-01"


def test_child_env_overrides_a_stale_scoped_traceparent(monkeypatch):
    """`LATITUDE_TRACEPARENT` outranks `TRACEPARENT` on read, so publishing only the
    latter would let a chained parent's header win over the tool span we just opened —
    the child would attach to its grandparent, silently."""
    monkeypatch.setenv("LATITUDE_TRACEPARENT", STALE)
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))

    env = child_env({"LATITUDE_TRACEPARENT": STALE})

    assert env["TRACEPARENT"] != STALE
    assert env["LATITUDE_TRACEPARENT"] == env["TRACEPARENT"]
    assert inherited_traceparent(env) == env["TRACEPARENT"]


def test_environ_export_overrides_and_restores_a_stale_scoped_traceparent(monkeypatch):
    monkeypatch.setenv("LATITUDE_TRACEPARENT", STALE)
    monkeypatch.setenv("LATITUDE_HERMES_EXPORT_TRACEPARENT", "1")
    reset_config()
    hooks._BUILDER = _Builder()
    hooks.on_pre_api_request(**_turn())
    try:
        hooks.on_pre_tool_call(**_turn(tool_name="terminal", tool_call_id="call-1"))
        assert os.environ["LATITUDE_TRACEPARENT"] != STALE
        assert inherited_traceparent() == os.environ["TRACEPARENT"]
    finally:
        hooks.on_post_tool_call(**_turn(tool_call_id="call-1", status="ok"))

    assert os.environ["LATITUDE_TRACEPARENT"] == STALE
