"""Auxiliary LLM accounting from Hermes's own ledger.

`approval`, `compression` and `title_generation` calls go through
`agent/auxiliary_client.py`, which fires no hooks at all — no hook-based
emitter can see them, and a session's cost is wrong without them. Hermes does
record them per `task` in `session_model_usage`, so at session teardown we read
that table (read-only, never a write, never a lock) and export the remainder
against what this process already sent.
"""

from __future__ import annotations

import sqlite3
import time
from typing import Any, Dict, List

from .config import _config, _debug
from .hermes import state_db_path
from .model import _Span
from .util import _now_ms, _span_id, _trace_id

_QUERY = """
SELECT task, model, billing_provider, billing_base_url, api_call_count,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       reasoning_tokens, billing_mode, cost_status, last_seen
  FROM session_model_usage
 WHERE session_id = ?
"""

# The two tasks that DO fire the api hooks: the main agent loop (`''`) and a
# background-review fork, which runs a full conversation loop of its own. Every
# other task goes through `agent/auxiliary_client.py`, which fires nothing.
_HOOK_VISIBLE_TASKS = frozenset({"", "background_review"})

_TOKEN_COLUMNS = (
    ("input_tokens", "gen_ai.usage.input_tokens"),
    ("output_tokens", "gen_ai.usage.output_tokens"),
    ("cache_read_tokens", "gen_ai.usage.cache_read.input_tokens"),
    ("cache_write_tokens", "gen_ai.usage.cache_creation.input_tokens"),
    ("reasoning_tokens", "gen_ai.usage.reasoning_tokens"),
)

# Session finalize already waits up to 10s for export delivery; match that window
# so a lagging hook-visible ledger flush does not skip auxiliary reconciliation.
_READ_RETRIES = 39
_READ_RETRY_DELAY = 0.25


def aux_spans(session_id: str, exported: Dict[str, int], context: Dict[str, Any]) -> List[_Span]:
    """One `aux:<task>` span per ledger task that no hook could have reported."""
    if not session_id or not _config().get("aux_usage"):
        return []
    rows = _read_rows(session_id, exported)
    if not rows:
        return []
    exported_calls = int(exported.get("api_call_count") or 0)
    hook_visible = sum(_calls(row) for row in rows if _task(row) in _HOOK_VISIBLE_TASKS)
    # If we exported more calls than the hook-visible tasks account for, our
    # assumption about which tasks fire hooks no longer holds — emitting would
    # risk double counting, so emit nothing.
    if exported_calls > hook_visible:
        _debug(f"auxiliary usage skipped: exported {exported_calls} calls against {hook_visible} hook-visible")
        return []
    rows = [row for row in rows if _task(row) not in _HOOK_VISIBLE_TASKS]
    if not rows:
        return []

    now = _now_ms()
    trace = _trace_id()
    root = _Span(
        trace_id=trace,
        span_id=_span_id(),
        parent_span_id="",
        name="interaction",
        start_ms=now,
        end_ms=now,
        attrs={**context, "span.type": "interaction", "interaction.kind": "auxiliary"},
    )
    spans: List[_Span] = []
    calls = 0
    for row in rows:
        if _calls(row) <= 0:
            continue
        calls += _calls(row)
        spans.append(_aux_span(trace, root, row, context, now))
    if not spans:
        return []
    root.attrs["hermes.llm_calls"] = calls
    return spans + [root]


def _task(row: Dict[str, Any]) -> str:
    return str(row.get("task") or "")


def _calls(row: Dict[str, Any]) -> int:
    return int(row.get("api_call_count") or 0)


def _read_rows(session_id: str, exported: Dict[str, int]) -> List[Dict[str, Any]]:
    """The ledger is written by a background flusher, so a short retry covers
    the window where our own calls are not on disk yet."""
    expected = int(exported.get("api_call_count") or 0)
    rows: List[Dict[str, Any]] = []
    for attempt in range(_READ_RETRIES + 1):
        rows = _query(session_id)
        if not rows:
            return []
        if sum(_calls(row) for row in rows if _task(row) in _HOOK_VISIBLE_TASKS) >= expected:
            return rows
        if attempt < _READ_RETRIES:
            time.sleep(_READ_RETRY_DELAY)
    return rows


def _query(session_id: str) -> List[Dict[str, Any]]:
    path = state_db_path()
    if not path.exists():
        return []
    try:
        connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=1.0)
    except Exception as exc:
        _debug(f"auxiliary usage unavailable: {exc}")
        return []
    try:
        connection.row_factory = sqlite3.Row
        return [dict(row) for row in connection.execute(_QUERY, (session_id,))]
    except Exception as exc:
        _debug(f"auxiliary usage query failed: {exc}")
        return []
    finally:
        connection.close()


def _aux_span(trace: str, root: _Span, row: Dict[str, Any], context: Dict[str, Any], now: int) -> _Span:
    task = _task(row)
    attrs: Dict[str, Any] = {
        **context,
        "span.type": "llm_request",
        "gen_ai.operation.name": "chat",
        "interaction.kind": "auxiliary",
        "hermes.aux.task": task,
        "hermes.aux.api_calls": _calls(row),
        "hermes.aux.source": "session_model_usage",
        "hermes.billing.mode": row.get("billing_mode") or None,
        "hermes.cost.status": row.get("cost_status") or None,
    }
    model = row.get("model")
    if model:
        attrs["model"] = model
        attrs["gen_ai.request.model"] = model
        attrs["gen_ai.response.model"] = model
    # The ledger's own route, so the span is priced like the calls it stands for.
    provider = row.get("billing_provider")
    if provider:
        attrs["gen_ai.provider.name"] = provider
        attrs["gen_ai.system"] = provider
    if row.get("billing_base_url"):
        attrs["hermes.base_url"] = row["billing_base_url"]
    for column, target in _TOKEN_COLUMNS:
        value = int(row.get(column) or 0)
        if value:
            attrs[target] = value
    # Reasoning is a subset of output, so it is not a term of the total.
    total = sum(
        int(row.get(column) or 0)
        for column in ("input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens")
    )
    if total:
        attrs["gen_ai.usage.total_tokens"] = total
    # An aggregate of N calls has no duration of its own: stamping one would
    # inflate the session's timings with a window that is not latency.
    at = _epoch_ms(row.get("last_seen"), now)
    return _Span(
        trace_id=trace,
        span_id=_span_id(),
        parent_span_id=root.span_id,
        name=f"aux:{task}",
        start_ms=at,
        end_ms=at,
        attrs=attrs,
    )


def _epoch_ms(value: Any, fallback: int) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return int(value * 1000)
    return fallback
