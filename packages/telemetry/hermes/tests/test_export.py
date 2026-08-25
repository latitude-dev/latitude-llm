"""Export path: batching, retries, flush and back-pressure.

The ingest cap is 32 MiB with no gzip decode, and `traces_mv`/`sessions_mv` are
additive per-insert rollups — so payloads stay small by construction and every
span id ships exactly once.
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any, Dict, List
from urllib import error as urlerr

import latitude_telemetry_hermes.transport as transport
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.config import EXPORT_MAX_PAYLOAD_BYTES
from latitude_telemetry_hermes.model import _Span


def _span(index: int, content: str = "hello") -> _Span:
    return _Span(
        trace_id="t" * 32,
        span_id=f"{index:016x}",
        parent_span_id="",
        name="llm_request",
        start_ms=1000,
        end_ms=1100,
        attrs={"gen_ai.input.messages:gated": [{"role": "user", "parts": [{"type": "text", "content": content}]}]},
    )


def _drain(timeout: float = 3.0) -> None:
    transport._flush(timeout)


def test_a_batch_is_delivered_and_flush_waits_for_it(monkeypatch):
    posted: List[Dict[str, Any]] = []
    started = threading.Event()

    def fake_post(payload: Dict[str, Any]) -> None:
        started.set()
        time.sleep(0.05)
        posted.append(payload)

    monkeypatch.setattr(transport, "_post_traces", fake_post)

    transport._ship([_span(1)])
    assert started.wait(2.0)
    _drain()

    assert len(posted) == 1, "delivery must complete before flush returns"
    spans = posted[0]["resourceSpans"][0]["scopeSpans"][0]["spans"]
    assert [s["spanId"] for s in spans] == [f"{1:016x}"]


def test_many_spans_split_into_sub_cap_payloads_with_no_duplicates(monkeypatch):
    posted: List[Dict[str, Any]] = []
    monkeypatch.setattr(transport, "_post_traces", posted.append)

    body = "x" * 60_000  # ~60 KB of content per span
    ids = []
    for index in range(200):
        span = _span(index, body)
        ids.append(span.span_id)
        transport._ship([span])
    _drain(10.0)

    shipped: List[str] = []
    for payload in posted:
        encoded = json.dumps(payload)
        assert len(encoded) < 32 * 1024 * 1024, "a request must never approach the ingest cap"
        shipped.extend(s["spanId"] for s in payload["resourceSpans"][0]["scopeSpans"][0]["spans"])

    assert len(shipped) == 200
    assert len(set(shipped)) == 200, "a resent span id would inflate every additive rollup"
    assert sorted(shipped) == sorted(ids)
    assert len(posted) > 1, "the batch ceiling is respected"


def test_coalescing_keeps_a_burst_to_few_requests(monkeypatch):
    posted: List[Dict[str, Any]] = []
    monkeypatch.setattr(transport, "_post_traces", posted.append)
    for index in range(50):
        transport._ship([_span(index)])
    _drain(10.0)
    total = sum(len(p["resourceSpans"][0]["scopeSpans"][0]["spans"]) for p in posted)
    assert total == 50
    assert len(posted) < 50, "queued spans coalesce into shared requests"


def test_a_503_is_retried_then_lands(monkeypatch):
    attempts: List[int] = []

    def fake_attempt(url, data, cfg, attempt):
        attempts.append(attempt)
        return 0.0 if attempt == 1 else None

    monkeypatch.setattr(transport, "_attempt_post", fake_attempt)
    transport._post_traces({"resourceSpans": []})
    assert attempts == [1, 2]


def test_a_400_is_never_retried(monkeypatch):
    calls: List[str] = []

    def fake_urlopen(req, timeout=0, context=None):
        calls.append("post")
        raise urlerr.HTTPError(req.full_url, 400, "Bad Request", {}, None)

    monkeypatch.setattr(transport._urlreq, "urlopen", fake_urlopen)
    transport._post_traces({"resourceSpans": []})
    assert calls == ["post"], "a malformed payload will not become valid on a retry"


def test_an_ambiguous_failure_drops_the_batch_rather_than_resending_it(monkeypatch):
    """A lost connection or a 5xx may have been committed before the response was
    lost. `traces_mv`/`sessions_mv` are additive per insert, so resending would
    inflate span counts, tokens and cost — worse than losing the batch."""
    for failure in (
        ConnectionResetError("reset"),
        TimeoutError("read timed out"),
        urlerr.HTTPError("http://x", 500, "Server Error", {}, None),
        urlerr.HTTPError("http://x", 502, "Bad Gateway", {}, None),
    ):
        calls: List[str] = []

        def fake_urlopen(req, timeout=0, context=None, _f=failure, _calls=calls):
            _calls.append("post")
            raise _f

        monkeypatch.setattr(transport._urlreq, "urlopen", fake_urlopen)
        transport._post_traces({"resourceSpans": []})
        assert calls == ["post"], f"{type(failure).__name__} must not be retried"


def test_an_explicit_refusal_is_retried(monkeypatch):
    """429 and 503 are ingest telling us it did not accept the batch, so a resend
    cannot double-insert."""
    for code in (429, 503):
        calls: List[str] = []

        def fake_urlopen(req, timeout=0, context=None, _c=code, _calls=calls):
            _calls.append("post")
            if len(_calls) == 1:
                raise urlerr.HTTPError("http://x", _c, "Refused", {}, None)

            class Resp:
                status = 200

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

            return Resp()

        monkeypatch.setattr(transport._urlreq, "urlopen", fake_urlopen)
        monkeypatch.setattr(transport.time, "sleep", lambda _s: None)
        transport._post_traces({"resourceSpans": []})
        assert len(calls) == 2, f"HTTP {code} must be retried"


def test_retry_after_is_honoured():
    assert transport._backoff(1, "2") == 2.0
    assert transport._backoff(1, "not a number") <= 1.0
    assert transport._backoff(1, "999") == 30.0, "a hostile Retry-After is clamped"


def test_a_full_queue_drops_the_oldest_rather_than_blocking(monkeypatch):
    monkeypatch.setattr(transport, "_start_worker", lambda: None)  # nothing drains
    original = transport._QUEUE
    transport._QUEUE = transport.Queue(maxsize=2)
    try:
        for index in range(5):
            transport._ship([_span(index)])
        assert transport._QUEUE.qsize() == 2
    finally:
        transport._QUEUE = original
        transport._complete(transport._PENDING)


def test_a_full_turn_ships_completely_with_the_root_last(monkeypatch):
    """The regression shape from the evidence session: one turn, many calls."""
    posted: List[Dict[str, Any]] = []
    monkeypatch.setattr(transport, "_post_traces", posted.append)

    b = _Builder()
    base = {
        "session_id": "sess-1",
        "task_id": "task-1",
        "turn_id": "turn-1",
        "request_messages": [{"role": "user", "content": "x" * 4000}],
        "user_message": "go",
        "model": "gpt-5.6-sol",
        "provider": "openai",
    }
    for call in range(1, 56):
        transport._ship(b.on_pre_api_request(**base, api_call_count=call, retry_count=0))
        transport._ship(
            b.on_post_api_request(
                **base,
                api_call_count=call,
                retry_count=0,
                assistant_message={"content": "", "tool_calls": [{"id": f"c{call}", "function": {"name": "t"}}]},
                usage={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
            )
        )
        b.on_pre_tool_call(**base, tool_name="terminal", tool_call_id=f"c{call}")
        transport._ship(
            b.on_post_tool_call(**base, tool_name="terminal", tool_call_id=f"c{call}", result="ok", status="ok")
        )
    transport._ship(b.finish_scoped(session_id="sess-1", completed=True))
    _drain(10.0)

    spans = [s for p in posted for s in p["resourceSpans"][0]["scopeSpans"][0]["spans"]]
    ids = [s["spanId"] for s in spans]
    assert len(ids) == len(set(ids)), "no span id ships twice"
    assert len(spans) == 55 * 2 + 1
    assert spans[-1]["name"] == "interaction", "the root is the last span of its turn"
    for payload in posted:
        assert len(json.dumps(payload)) <= EXPORT_MAX_PAYLOAD_BYTES + 2 * 1024 * 1024
