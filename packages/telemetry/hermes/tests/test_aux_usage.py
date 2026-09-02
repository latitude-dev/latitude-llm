"""Auxiliary LLM accounting.

`approval`, `compression` and `title_generation` go through
`agent/auxiliary_client.py`, which fires no hooks — a session's cost is wrong
without reading Hermes's own per-task ledger.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List

import pytest
from helpers import attr_map, span_attrs

import latitude_telemetry_hermes.aux_usage as aux_usage_module
import latitude_telemetry_hermes.hooks as hooks
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.config import reset_config
from latitude_telemetry_hermes.hermes import state_db_path
from latitude_telemetry_hermes.otlp import _build_otlp

_SCHEMA = """
CREATE TABLE session_model_usage (
    session_id TEXT NOT NULL,
    model TEXT NOT NULL,
    billing_provider TEXT NOT NULL DEFAULT '',
    billing_base_url TEXT NOT NULL DEFAULT '',
    billing_mode TEXT NOT NULL DEFAULT '',
    task TEXT NOT NULL DEFAULT '',
    api_call_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    actual_cost_usd REAL NOT NULL DEFAULT 0,
    cost_status TEXT,
    cost_source TEXT,
    first_seen REAL,
    last_seen REAL
);
"""

# The real numbers from the dogfood session, so the reconciliation is checked
# against a shape that actually happened.
_ROWS = [
    ("", 205, 668_303, 81_784, 26_727_680, 31_529),
    ("background_review", 31, 76_666, 18_367, 4_865_408, 4_054),
    ("approval", 38, 15_771, 1_457, 0, 0),
    ("compression", 2, 37_509, 16_499, 0, 0),
    ("title_generation", 1, 312, 73, 0, 0),
]


@pytest.fixture
def ledger() -> Path:
    path = Path(state_db_path())
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.executescript(_SCHEMA)
    connection.executemany(
        """INSERT INTO session_model_usage
             (session_id, model, billing_provider, billing_mode, task, api_call_count, input_tokens,
              output_tokens, cache_read_tokens, reasoning_tokens, cost_status, first_seen, last_seen)
           VALUES (?, 'gpt-5.6-sol', 'openai-codex', 'subscription_included', ?, ?, ?, ?, ?, ?,
                   'included', 1000.0, 2000.0)""",
        [("sess-1", task, calls, inp, out, cache, reasoning) for task, calls, inp, out, cache, reasoning in _ROWS],
    )
    connection.commit()
    connection.close()
    return path


def _exported(calls: int = 236) -> Dict[str, int]:
    """What the hooks let us export: the main loop plus the review forks, as a
    total — the payloads carry no task label."""
    return {
        "api_call_count": calls,
        "input_tokens": 744_969,
        "output_tokens": 100_151,
        "cache_read_tokens": 31_593_088,
        "reasoning_tokens": 35_583,
    }


def _names(spans: List[Any]) -> List[str]:
    return [span.name for span in spans]


def test_only_the_calls_no_hook_could_see_are_emitted(ledger: Path):
    spans = aux_usage_module.aux_spans("sess-1", _exported(), {"session.id": "sess-1"})
    assert _names(spans) == ["aux:approval", "aux:compression", "aux:title_generation", "interaction"]
    assert spans[-1].attrs["hermes.llm_calls"] == 41, "38 approval + 2 compression + 1 title"


def test_the_hook_visible_tasks_are_never_re_emitted(ledger: Path):
    """The main loop and background-review forks fire the api hooks, so their
    ledger rows are already in Latitude. Emitting them again invents tokens —
    the first dogfood run produced a phantom `aux:main` worth 166k input."""
    tasks = {span.attrs.get("hermes.aux.task") for span in aux_usage_module.aux_spans("sess-1", _exported(), {})}
    assert "" not in tasks and "main" not in tasks
    assert "background_review" not in tasks
    assert tasks == {"approval", "compression", "title_generation", None}


def test_it_gives_up_rather_than_risk_double_counting(ledger: Path, monkeypatch):
    """If we exported more calls than the hook-visible tasks account for, the
    assumption about which tasks fire hooks no longer holds."""
    slept: List[float] = []
    monkeypatch.setattr(aux_usage_module.time, "sleep", lambda seconds: slept.append(seconds))
    assert aux_usage_module.aux_spans("sess-1", _exported(calls=999), {}) == []
    assert slept == []


def test_it_gives_up_when_the_teardown_deadline_expires(ledger: Path, monkeypatch):
    """A shared teardown deadline bounds the wait; the guard still skips."""
    clock = {"now": 0.0}
    monkeypatch.setattr(aux_usage_module.time, "monotonic", lambda: clock["now"])
    monkeypatch.setattr(aux_usage_module.time, "sleep", lambda seconds: clock.update(now=clock["now"] + seconds))
    assert aux_usage_module.aux_spans("sess-1", _exported(calls=999), {}, deadline=0.5) == []
    assert clock["now"] == pytest.approx(0.5)


def test_aux_is_emitted_once_the_hook_visible_ledger_catches_up(ledger: Path, monkeypatch):
    """The ledger flusher can land auxiliary rows before hook-visible ones."""
    reads = {"count": 0}
    original_query = aux_usage_module._query

    def lagging_query(session_id: str) -> List[Dict[str, Any]]:
        reads["count"] += 1
        rows = original_query(session_id)
        if reads["count"] <= 3:
            return [row for row in rows if str(row.get("task") or "") not in {"", "background_review"}]
        return rows

    monkeypatch.setattr(aux_usage_module, "_query", lagging_query)
    monkeypatch.setattr(aux_usage_module.time, "sleep", lambda _: None)

    spans = aux_usage_module.aux_spans(
        "sess-1", _exported(), {"session.id": "sess-1"}, deadline=aux_usage_module.time.monotonic() + 10
    )
    assert _names(spans) == ["aux:approval", "aux:compression", "aux:title_generation", "interaction"]


def test_an_aux_span_is_priced_on_the_ledgers_own_route(ledger: Path):
    span = next(s for s in aux_usage_module.aux_spans("sess-1", _exported(), {}) if s.name == "aux:compression")
    assert span.attrs["gen_ai.provider.name"] == "openai-codex"
    assert span.attrs["gen_ai.system"] == "openai-codex"


def test_an_aux_span_has_no_duration_of_its_own(ledger: Path):
    """It stands for N calls; a first_seen..last_seen window is not latency, and
    stamping one inflated the session's timings by twenty minutes."""
    for span in aux_usage_module.aux_spans("sess-1", _exported(), {}):
        assert span.start_ms == span.end_ms


def test_an_aux_span_carries_the_tokens_and_its_provenance(ledger: Path):
    spans = aux_usage_module.aux_spans("sess-1", _exported(), {"session.id": "sess-1"})
    attrs = span_attrs(spans, "aux:compression")
    assert attrs["gen_ai.operation.name"] == "chat", "so it lands in the token gate"
    assert attrs["gen_ai.usage.input_tokens"] == 37_509
    assert attrs["gen_ai.usage.output_tokens"] == 16_499
    assert attrs["gen_ai.usage.total_tokens"] == 37_509 + 16_499
    assert attrs["hermes.aux.task"] == "compression"
    assert attrs["hermes.aux.api_calls"] == 2
    assert attrs["hermes.aux.source"] == "session_model_usage"
    assert attrs["interaction.kind"] == "auxiliary"
    assert attrs["session.id"] == "sess-1"
    assert attrs["hermes.billing.mode"] == "subscription_included"


def test_a_missing_ledger_is_a_no_op(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "nowhere"))
    assert aux_usage_module.aux_spans("sess-1", _exported(), {}) == []


def test_an_unknown_session_is_a_no_op(ledger: Path):
    assert aux_usage_module.aux_spans("other-session", _exported(), {}) == []


def test_the_aux_trace_joins_the_session_even_without_a_live_context(ledger: Path):
    from latitude_telemetry_hermes.builder import _Builder

    context = _Builder().context_for_session("sess-1")
    assert context["session.id"] == "sess-1", "a released context must not orphan the aux trace"
    spans = aux_usage_module.aux_spans("sess-1", _exported(), context)
    assert all(span.attrs["session.id"] == "sess-1" for span in spans)


def test_it_can_be_turned_off(ledger: Path, monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_AUX_USAGE", "0")
    reset_config()
    assert aux_usage_module.aux_spans("sess-1", _exported(), {}) == []


def test_the_totals_reconcile_with_the_whole_ledger(ledger: Path):
    """Latitude's session totals equal SUM(session_model_usage) for the session."""
    exported = _exported()
    encoded = _build_otlp(aux_usage_module.aux_spans("sess-1", exported, {}))
    encoded = encoded["resourceSpans"][0]["scopeSpans"][0]["spans"]

    aux_input = sum(attr_map(s["attributes"]).get("gen_ai.usage.input_tokens", 0) for s in encoded)
    assert exported["input_tokens"] + aux_input == sum(row[2] for row in _ROWS)

    aux_output = sum(attr_map(s["attributes"]).get("gen_ai.usage.output_tokens", 0) for s in encoded)
    assert exported["output_tokens"] + aux_output == sum(row[3] for row in _ROWS)


def test_a_subagents_auxiliary_calls_are_reconciled_into_the_parent_session(ledger: Path):
    """A child records its usage under its own session id and never gets a
    finalize of its own, so only the parent's teardown can reach those rows —
    and they belong to the parent's session, where its spans already are."""
    connection = sqlite3.connect(ledger)
    connection.execute(
        """INSERT INTO session_model_usage
             (session_id, model, billing_provider, task, api_call_count, input_tokens, output_tokens)
           VALUES ('child-1', 'gpt-5.6-sol', 'openai-codex', 'approval', 1, 404, 7)""",
    )
    connection.execute(
        """INSERT INTO session_model_usage
             (session_id, model, billing_provider, task, api_call_count, input_tokens, output_tokens)
           VALUES ('child-1', 'gpt-5.6-sol', 'openai-codex', '', 9, 34694, 2485)""",
    )
    connection.commit()
    connection.close()

    builder = _Builder()
    parent = builder._session_locked("sess-1", {"platform": "cli"})
    parent.exported.update(_exported())
    parent.child_sessions.append("child-1")
    child = builder._session_locked("child-1", {"platform": "cli"})
    child.exported["api_call_count"] = 9

    hooks._BUILDER = builder
    try:
        spans = hooks._aux_usage("sess-1")
    finally:
        hooks._BUILDER = _Builder()

    tasks = {s.attrs.get("hermes.aux.task") for s in spans}
    assert "approval" in tasks
    assert all(s.attrs["session.id"] == "sess-1" for s in spans), (
        "the child's auxiliary usage belongs to the parent's session"
    )
    child_approval = [s for s in spans if s.attrs.get("hermes.aux.api_calls") == 1]
    assert any(s.attrs.get("gen_ai.usage.input_tokens") == 404 for s in child_approval)


def test_the_ledger_is_only_ever_read(ledger: Path):
    before = ledger.read_bytes()
    aux_usage_module.aux_spans("sess-1", _exported(), {})
    assert ledger.read_bytes() == before, "never a write, never a lock"
