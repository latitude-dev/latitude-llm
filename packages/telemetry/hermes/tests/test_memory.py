"""Memory telemetry against a temp HERMES_HOME.

One store per profile, one record per store file, body = the whole file: that
is the granularity Latitude's ledger turns into per-line diffs and blame.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest
from helpers import by_name, span_attrs

import latitude_telemetry_hermes.memory as memory_store
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.config import reset_config

_ENTRY_DELIMITER = "\n§\n"

_TURN = {
    "session_id": "sess-1",
    "task_id": "task-1",
    "turn_id": "turn-1",
    "api_call_count": 1,
    "retry_count": 0,
    "platform": "cli",
    "model": "gpt-5.6-sol",
    "request_messages": [{"role": "user", "content": "remember that"}],
    "user_message": "remember that",
}


@pytest.fixture
def memories(tmp_path: Path) -> Path:
    directory = Path(memory_store.memory_dir())
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _write(memories: Path, name: str, entries: List[str]) -> None:
    (memories / name).write_text(_ENTRY_DELIMITER.join(entries), encoding="utf-8")


def _tool_call(**overrides: Any) -> Dict[str, Any]:
    payload = {
        "session_id": "sess-1",
        "task_id": "task-1",
        "turn_id": "turn-1",
        "tool_name": "memory",
        "tool_call_id": "m1",
        "args": {"target": "memory", "action": "add", "content": "alex prefers terse output"},
        "result": {"success": True, "done": True, "target": "memory",
                   "usage": "12% — 264/2,200 chars", "entry_count": 2},
        "status": "ok",
        "duration_ms": 3,
    }
    payload.update(overrides)
    return payload


# --- the session-start read ------------------------------------------------


def test_the_frozen_snapshot_is_read_once_per_session(memories: Path):
    _write(memories, "MEMORY.md", ["prefers terse output"])
    _write(memories, "USER.md", ["alex, works at latitude"])

    b = _Builder()
    first = b.on_pre_api_request(**_TURN)
    assert sorted(s.attrs["gen_ai.memory.record.id"] for s in first) == ["MEMORY.md", "USER.md"]
    assert all(s.name == "search_memory" for s in first)
    assert all(s.kind == 3 for s in first)

    second = b.on_pre_api_request(**{**_TURN, "api_call_count": 2})
    assert second == [], "memory enters the prompt as a frozen snapshot, so it is read once"


def test_a_read_span_carries_the_store_record_and_body(memories: Path):
    _write(memories, "MEMORY.md", ["prefers terse output", "uses zsh"])
    b = _Builder()
    spans = b.on_pre_api_request(**_TURN)
    attrs = span_attrs(spans, "search_memory")
    assert attrs["gen_ai.memory.store.id"] == "hermes/default"
    assert attrs["gen_ai.memory.record.id"] == "MEMORY.md"
    assert attrs["gen_ai.memory.record.count"] == 1
    assert "prefers terse output" in attrs["gen_ai.memory.records"]
    assert attrs["hermes.memory.entry_count"] == 2
    assert "gen_ai.memory.query.text" not in attrs, "a full-store snapshot is not a query"


def test_the_read_latch_is_released_on_a_session_reset(memories: Path):
    _write(memories, "MEMORY.md", ["a"])
    b = _Builder()
    assert b.on_pre_api_request(**_TURN)
    b.on_session_reset(session_id="sess-1")
    assert b.on_pre_api_request(**{**_TURN, "turn_id": "turn-2"}), "a /reset starts a new snapshot"


def test_an_empty_store_is_not_read(memories: Path):
    _write(memories, "MEMORY.md", [])
    assert _Builder().on_pre_api_request(**_TURN) == []


def test_the_store_id_follows_the_profile(monkeypatch):
    class Ctx:
        profile_name = "alescriptslack"

        def get_config(self, key, default=None):
            return default

    import latitude_telemetry_hermes.config as config

    config.set_plugin_context(Ctx())
    assert memory_store.store_id() == "hermes/alescriptslack"


# --- writes ----------------------------------------------------------------


def _write_turn(b: _Builder, memories: Path, **overrides: Any) -> List[Any]:
    b.on_pre_api_request(**_TURN)
    b.on_pre_tool_call(session_id="sess-1", task_id="task-1", turn_id="turn-1", tool_name="memory", tool_call_id="m1")
    return b.on_post_tool_call(**_tool_call(**overrides))


def test_a_successful_write_emits_upsert_under_the_tool_span(memories: Path):
    _write(memories, "MEMORY.md", ["prefers terse output", "alex prefers terse output"])
    b = _Builder()
    spans = _write_turn(b, memories)

    names = [s.name for s in spans]
    assert names == ["tool_call:memory", "upsert_memory"]
    tool, memory = spans
    assert memory.parent_span_id == tool.span_id, "claude-code parity: a child of the tool that caused it"

    attrs = span_attrs(spans, "upsert_memory")
    assert attrs["gen_ai.memory.record.id"] == "MEMORY.md"
    assert "alex prefers terse output" in attrs["gen_ai.memory.records"]
    assert attrs["hermes.memory.action"] == "add"
    assert attrs["hermes.memory.limit_chars"] == 2200
    assert attrs["hermes.memory.entry_count"] == 2


def test_a_batch_write_is_still_one_span_per_record(memories: Path):
    _write(memories, "MEMORY.md", ["kept", "added"])
    spans = _write_turn(
        _Builder(),
        memories,
        args={
            "target": "memory",
            "operations": [{"action": "remove", "old_text": "stale"}, {"action": "add", "content": "added"}],
        },
    )
    assert [s.name for s in spans] == ["tool_call:memory", "upsert_memory"]
    assert span_attrs(spans, "upsert_memory")["hermes.memory.action"] == "batch"


def test_emptying_the_store_is_a_delete_with_the_record_named(memories: Path):
    _write(memories, "MEMORY.md", [])
    spans = _write_turn(
        _Builder(),
        memories,
        args={"target": "memory", "action": "remove", "old_text": "prefers"},
        result={"success": True, "target": "memory", "usage": "0% — 0/2,200 chars", "entry_count": 0},
    )
    attrs = span_attrs(spans, "delete_memory")
    # An omitted record id is the OTEL signal for a whole-store wipe, which the
    # ledger turns into a tombstone for every record in the store.
    assert attrs["gen_ai.memory.record.id"] == "MEMORY.md"
    assert "gen_ai.memory.records" not in attrs


def test_a_failed_write_emits_nothing(memories: Path):
    _write(memories, "MEMORY.md", ["unchanged"])
    spans = _write_turn(
        _Builder(),
        memories,
        status="error",
        error_type="tool_error",
        error_message="over budget",
        result={"success": False, "error": "over budget"},
    )
    assert [s.name for s in spans] == ["tool_call:memory"], "nothing changed, so nothing is recorded"


def test_a_concurrent_sister_write_drops_the_body_but_keeps_the_span(memories: Path):
    _write(memories, "MEMORY.md", ["one", "two", "three"])
    spans = _write_turn(_Builder(), memories, result={"success": True, "target": "memory", "entry_count": 2})
    attrs = span_attrs(spans, "upsert_memory")
    assert "gen_ai.memory.records" not in attrs, "a body we cannot vouch for is not exported"
    assert attrs["gen_ai.memory.record.id"] == "MEMORY.md"


def test_a_non_memory_tool_emits_no_memory_span(memories: Path):
    _write(memories, "MEMORY.md", ["a"])
    b = _Builder()
    b.on_pre_api_request(**_TURN)
    b.on_pre_tool_call(session_id="sess-1", task_id="task-1", turn_id="turn-1", tool_name="terminal", tool_call_id="t1")
    spans = b.on_post_tool_call(
        session_id="sess-1", task_id="task-1", turn_id="turn-1", tool_name="terminal", tool_call_id="t1",
        result="ok", status="ok",
    )
    assert [s.name for s in spans] == ["tool_call:terminal"]


# --- switches --------------------------------------------------------------


def test_memory_telemetry_can_be_turned_off(memories: Path, monkeypatch):
    _write(memories, "MEMORY.md", ["a"])
    monkeypatch.setenv("LATITUDE_HERMES_MEMORY", "0")
    reset_config()
    assert _Builder().on_pre_api_request(**_TURN) == []


def test_bodies_are_suppressed_but_the_structure_survives(memories: Path, monkeypatch):
    _write(memories, "MEMORY.md", ["a secret note"])
    monkeypatch.setenv("LATITUDE_HERMES_MEMORY_CONTENT", "0")
    reset_config()
    spans = _Builder().on_pre_api_request(**_TURN)
    attrs = span_attrs(spans, "search_memory")
    assert "gen_ai.memory.records" not in attrs
    assert attrs["gen_ai.memory.store.id"] == "hermes/default"
    assert attrs["gen_ai.memory.record.count"] == 1


def test_an_external_provider_disables_the_builtin_store(memories: Path, monkeypatch):
    _write(memories, "MEMORY.md", ["a"])
    monkeypatch.setattr(memory_store, "external_memory_provider", lambda: "mem0")
    assert _Builder().on_pre_api_request(**_TURN) == []


def test_bodies_are_capped(memories: Path):
    records = memory_store.records_attribute("MEMORY.md", "x" * (memory_store.MEMORY_RECORDS_CAP + 500))
    assert len(records[0]["content"]) == memory_store.MEMORY_RECORDS_CAP


def test_entry_counting_follows_the_delimiter():
    assert memory_store.entry_count("") == 0
    assert memory_store.entry_count("one") == 1
    assert memory_store.entry_count(f"one{_ENTRY_DELIMITER}two{_ENTRY_DELIMITER}three") == 3


def test_by_name_helper_exposes_every_span(memories: Path):
    _write(memories, "MEMORY.md", ["a"])
    assert set(by_name(_Builder().on_pre_api_request(**_TURN))) == {"search_memory"}
