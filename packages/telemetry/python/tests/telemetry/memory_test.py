"""Tests for the memory-operation span helper (create_memory_telemetry)."""

import json
from typing import Any

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from latitude_telemetry import Latitude, capture, create_memory_telemetry
from latitude_telemetry.constants import SCOPE_LATITUDE


def _new_latitude() -> tuple[InMemorySpanExporter, Latitude]:
    exporter = InMemorySpanExporter()
    lat = Latitude(
        api_key="test-api-key",
        project="test-project",
        disable_batch=True,
        tracer_provider=TracerProvider(),
        exporter=exporter,
    )
    return exporter, lat


def _span(exporter: InMemorySpanExporter, name: str):
    return next((s for s in exporter.get_finished_spans() if s.name == name), None)


class TestMemoryTelemetry:
    def test_emits_create_memory_span_without_content_by_default(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        memory.create(record_id="mem_1", records=[{"content": "likes tea"}])
        lat.flush()

        span = _span(exporter, "create_memory")
        assert span is not None
        assert span.instrumentation_scope is not None
        attrs = span.attributes or {}
        assert span.instrumentation_scope.name == f"{SCOPE_LATITUDE}.memory"
        assert attrs["gen_ai.operation.name"] == "create_memory"
        assert attrs["gen_ai.memory.store.id"] == "prefs"
        assert attrs["gen_ai.memory.record.id"] == "mem_1"
        assert attrs["gen_ai.memory.record.count"] == 1
        assert isinstance(attrs["gen_ai.memory.record.count"], int)
        assert "gen_ai.memory.records" not in attrs

        lat.shutdown()

    def test_sends_content_as_json_array_only_when_enabled_with_redact(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(
            lat,
            store_id="prefs",
            capture_content=True,
            redact=lambda records, _info: [{**r, "content": "[redacted]"} for r in records],
        )

        memory.update(record_id="mem_1", records=[{"id": "mem_1", "content": "likes tea", "metadata": {"src": "chat"}}])
        lat.flush()

        span = _span(exporter, "update_memory")
        assert span is not None
        raw = (span.attributes or {})["gen_ai.memory.records"]
        assert isinstance(raw, str)

        parsed: list[Any] = json.loads(raw)
        # Contract self-check: non-empty array, every element has `content`.
        assert isinstance(parsed, list)
        assert len(parsed) > 0
        assert all("content" in r for r in parsed)
        assert parsed[0]["content"] == "[redacted]"

        lat.shutdown()

    def test_wrap_sync_execute_returns_result_and_stamps_context(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(
            lat,
            store_id="prefs",
            context={"session_id": "sess-1", "user_id": "user-1", "project": "test-project"},
        )

        result = memory.create(record_id="mem_1", execute=lambda: {"ok": True})
        assert result == {"ok": True}
        lat.flush()

        span = _span(exporter, "create_memory")
        assert span is not None
        attrs = span.attributes or {}
        assert attrs["session.id"] == "sess-1"
        assert attrs["user.id"] == "user-1"
        assert attrs["latitude.project"] == "test-project"

        lat.shutdown()

    async def test_wrap_async_execute_returns_result(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        async def do_write() -> dict[str, bool]:
            return {"ok": True}

        result = await memory.upsert(record_id="mem_1", execute=do_write)
        assert result == {"ok": True}
        lat.flush()

        assert _span(exporter, "upsert_memory") is not None
        lat.shutdown()

    async def test_sync_callable_returning_awaitable_is_awaited(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        async def do_write() -> str:
            return "done"

        result = await memory.create(record_id="mem_1", execute=lambda: do_write())
        assert result == "done"
        lat.flush()

        assert _span(exporter, "create_memory") is not None
        lat.shutdown()

    def test_records_exception_and_reraises(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        def boom() -> None:
            raise RuntimeError("boom")

        try:
            memory.delete(record_id="mem_1", execute=boom)
            raise AssertionError("expected RuntimeError")
        except RuntimeError as error:
            assert str(error) == "boom"
        lat.flush()

        span = _span(exporter, "delete_memory")
        assert span is not None
        assert span.status.status_code == StatusCode.ERROR
        assert any(event.name == "exception" for event in span.events)

        lat.shutdown()

    def test_search_maps_results_and_always_sets_count(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        hits = [
            {"id": "mem_1", "content": "likes tea", "score": 0.9},
            {"id": "mem_2", "content": "lives in Barcelona", "score": 0.7},
        ]
        result = memory.search(query="preferences", execute=lambda: hits, records_from_result=lambda r: r)
        assert result == hits
        lat.flush()

        span = _span(exporter, "search_memory")
        assert span is not None
        attrs = span.attributes or {}
        assert attrs["gen_ai.memory.query.text"] == "preferences"
        assert attrs["gen_ai.memory.record.count"] == 2
        # Count is not content, so it rides even with capture off.
        assert "gen_ai.memory.records" not in attrs

        lat.shutdown()

    def test_delete_without_record_id_is_a_whole_store_wipe(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat)

        memory.delete(store_id="prefs")
        memory.create_store(store_id="prefs")
        lat.flush()

        wipe = _span(exporter, "delete_memory")
        assert wipe is not None
        wipe_attrs = wipe.attributes or {}
        assert wipe_attrs["gen_ai.memory.store.id"] == "prefs"
        assert "gen_ai.memory.record.id" not in wipe_attrs

        create_store = _span(exporter, "create_memory_store")
        assert create_store is not None
        assert (create_store.attributes or {})["gen_ai.operation.name"] == "create_memory_store"

        lat.shutdown()

    def test_inherits_context_from_enclosing_capture(self):
        exporter, lat = _new_latitude()
        memory = create_memory_telemetry(lat, store_id="prefs")

        capture(
            "agent-run",
            lambda: memory.create(record_id="mem_1"),
            {"session_id": "sess-9", "user_id": "user-9"},
        )
        lat.flush()

        span = _span(exporter, "create_memory")
        assert span is not None
        attrs = span.attributes or {}
        assert attrs["session.id"] == "sess-9"
        assert attrs["user.id"] == "user-9"

        lat.shutdown()
