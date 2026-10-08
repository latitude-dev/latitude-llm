"""Regression tests for #4833: redaction must not write into frozen span attributes, raise, or drop spans."""

import re
from collections.abc import Iterator
from typing import Any

import pytest
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry import (
    ATTRIBUTES,
    COST_SOURCE_USER,
    REDACTION_EXEMPT_ATTRIBUTES,
    LatitudeSpanProcessor,
    RedactSpanProcessor,
    RedactThenExportSpanProcessor,
    capture,
)
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessorOptions
from latitude_telemetry.telemetry.redact_span_processor import FALLBACK_MASK, RedactSpanProcessorOptions

LLM_ATTRS: dict[str, Any] = {
    "gen_ai.operation.name": "chat",
    "gen_ai.system": "openai",
    "gen_ai.request.model": "gpt-4o",
    "gen_ai.usage.input_tokens": 1000,
    "gen_ai.usage.output_tokens": 500,
}
PRICING = {"openai/gpt-4o": {"input_per_1m": 2.5, "output_per_1m": 10.0}}


class Harness:
    def __init__(self, **options: Any) -> None:
        self.exporter = InMemorySpanExporter()
        self.other_exporter = InMemorySpanExporter()
        self.provider = TracerProvider()
        self.provider.add_span_processor(
            LatitudeSpanProcessor(
                "fake-api-key",
                "test-project",
                LatitudeSpanProcessorOptions(disable_batch=True, exporter=self.exporter, **options),
            )
        )
        # An unrelated processor on the same provider: Latitude's redaction is export-only.
        self.provider.add_span_processor(SimpleSpanProcessor(self.other_exporter))
        self.tracer = self.provider.get_tracer("test.llm")

    def llm_call(self, name: str = "openai.chat", event: dict[str, Any] | None = None, **extra: Any) -> None:
        with self.tracer.start_as_current_span(name, attributes={**LLM_ATTRS, **extra}) as span:
            if event is not None:
                span.add_event("details", attributes=event)

    def span(self, name: str = "openai.chat") -> ReadableSpan:
        spans = {s.name: s for s in self.exporter.get_finished_spans()}
        assert name in spans, f"{name} was not exported"
        return spans[name]

    def other_span(self, name: str = "openai.chat") -> ReadableSpan:
        return {s.name: s for s in self.other_exporter.get_finished_spans()}[name]


@pytest.fixture
def harness_factory() -> Iterator[Any]:
    created: list[Harness] = []

    def make(**options: Any) -> Harness:
        h = Harness(**options)
        created.append(h)
        return h

    yield make
    for h in created:
        h.provider.shutdown()


class TestLatitudeSpanProcessorRedaction:
    def test_default_pattern_redacts_db_statement_without_raising(self, harness_factory: Any) -> None:
        h = harness_factory()
        h.llm_call(**{"db.statement": "SELECT * FROM users"})
        attrs = h.span().attributes or {}
        assert attrs["db.statement"] == FALLBACK_MASK
        assert attrs["gen_ai.request.model"] == "gpt-4o"

    def test_custom_pattern_redacts_without_raising(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^secret\."), "api.token"]))
        h.llm_call(**{"secret.password": "hunter2", "api.token": "tok", "db.statement": "SELECT 1"})
        attrs = h.span().attributes or {}
        assert attrs["secret.password"] == FALLBACK_MASK
        assert attrs["api.token"] == FALLBACK_MASK
        # Custom patterns replace the defaults.
        assert attrs["db.statement"] == "SELECT 1"

    def test_custom_mask(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=["secret"], mask=lambda k, v: f"<{k}>"))
        h.llm_call(secret="s3cr3t")
        assert (h.span().attributes or {})["secret"] == "<secret>"

    def test_event_attributes_are_redacted(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^secret\.")]))
        h.llm_call(event={"secret.value": "hunter2", "public": "ok"})
        (event,) = h.span().events
        assert event.name == "details"
        assert dict(event.attributes or {}) == {"secret.value": FALLBACK_MASK, "public": "ok"}

    def test_disable_redact_exports_raw_values(self, harness_factory: Any) -> None:
        h = harness_factory(disable_redact=True)
        h.llm_call(**{"db.statement": "SELECT 1"})
        assert (h.span().attributes or {})["db.statement"] == "SELECT 1"

    def test_other_processors_see_the_unredacted_span(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^secret\.")]))
        h.llm_call(event={"secret.value": "hunter2"}, **{"secret.password": "hunter2"})
        assert (h.span().attributes or {})["secret.password"] == FALLBACK_MASK
        other = h.other_span()
        assert (other.attributes or {})["secret.password"] == "hunter2"
        assert dict(other.events[0].attributes or {}) == {"secret.value": "hunter2"}

    def test_mask_failure_fails_closed_and_still_exports(self, harness_factory: Any) -> None:
        def broken_mask(key: str, value: object) -> str:
            raise RuntimeError("boom")

        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=["secret"], mask=broken_mask))
        h.llm_call(event={"secret": "e"}, secret="s3cr3t")
        span = h.span()
        assert (span.attributes or {})["secret"] == FALLBACK_MASK
        assert dict(span.events[0].attributes or {})["secret"] == FALLBACK_MASK

    def test_non_attribute_mask_result_falls_back(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=["secret"], mask=lambda k, v: {"x": 1}))  # type: ignore[arg-type, return-value]
        h.llm_call(secret="s3cr3t")
        assert (h.span().attributes or {})["secret"] == FALLBACK_MASK

    def test_redactor_crash_masks_everything_and_still_exports(
        self, harness_factory: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def crash(self: RedactSpanProcessor, attributes: Any) -> None:
            raise RuntimeError("boom")

        monkeypatch.setattr(RedactSpanProcessor, "redact_attributes", crash)
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=["secret"]))
        h.llm_call(event={"secret": "e"}, secret="s3cr3t")
        span = h.span()
        assert set((span.attributes or {}).values()) == {FALLBACK_MASK}
        assert span.events == ()

    def test_cost_and_redaction_compose(self, harness_factory: Any) -> None:
        # `^gen_ai\.` masks the token counts cost is priced from, and matches the cost keys.
        h = harness_factory(pricing=PRICING, redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^gen_ai\.")]))
        h.llm_call(**{"gen_ai.usage.input_cost": 99.0})
        attrs = h.span().attributes or {}
        assert attrs["gen_ai.usage.input_tokens"] == FALLBACK_MASK
        assert attrs["gen_ai.usage.output_tokens"] == FALLBACK_MASK
        # Priced from the unredacted tokens, written after redaction, so never masked.
        assert attrs[ATTRIBUTES.cost_input] == pytest.approx(0.0025)
        assert attrs[ATTRIBUTES.cost_total] == pytest.approx(0.0075)
        assert attrs[ATTRIBUTES.cost_source] == COST_SOURCE_USER

    def test_capture_cost_survives_redaction(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^gen_ai\.")]))
        capture("agent", lambda: h.llm_call(), cost={"total": 0.5})
        attrs = h.span().attributes or {}
        assert attrs["gen_ai.usage.input_tokens"] == FALLBACK_MASK
        assert attrs[ATTRIBUTES.cost_total] == 0.5

    def test_instrumentor_cost_is_redacted_when_the_sdk_sets_none(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"_cost$")]))
        h.llm_call(**{"gen_ai.usage.total_cost": 1.0})
        attrs = h.span().attributes or {}
        assert attrs["gen_ai.usage.total_cost"] == FALLBACK_MASK
        assert ATTRIBUTES.cost_source not in attrs


ATTRIBUTION = {
    ATTRIBUTES.operation_name: "chat",
    ATTRIBUTES.provider_name: "openai",
    ATTRIBUTES.system: "openai",
    ATTRIBUTES.request_model: "gpt-4o",
    ATTRIBUTES.response_model: "gpt-4o-2024-08-06",
}
SDK_COST_KEYS = {ATTRIBUTES.cost_input, ATTRIBUTES.cost_output, ATTRIBUTES.cost_total, ATTRIBUTES.cost_source}


class TestAttributionAttributesAreExempt:
    """Regex patterns never mask the operation/provider/model keys Latitude needs to attribute a span."""

    def _assert_only_attribution_survives(self, attrs: Any) -> None:
        for key, value in attrs.items():
            if key in REDACTION_EXEMPT_ATTRIBUTES:
                assert value == ATTRIBUTION[key], key
            elif key not in SDK_COST_KEYS:
                assert value == FALLBACK_MASK, key
        assert set(ATTRIBUTION) <= set(attrs)

    def test_exempt_keys_match_the_attribute_constants(self) -> None:
        assert REDACTION_EXEMPT_ATTRIBUTES == frozenset(ATTRIBUTION)

    def test_broad_pattern_with_sdk_cost(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING, redact=RedactSpanProcessorOptions(attributes=[re.compile(r".*")]))
        h.llm_call(**ATTRIBUTION, **{"gen_ai.prompt.0.content": "secret prompt", "user.email": "a@b.c"})
        attrs = h.span().attributes or {}
        self._assert_only_attribution_survives(attrs)
        assert attrs["gen_ai.prompt.0.content"] == FALLBACK_MASK
        assert attrs[ATTRIBUTES.cost_total] == pytest.approx(0.0075)
        assert attrs[ATTRIBUTES.cost_source] == COST_SOURCE_USER

    def test_broad_pattern_without_sdk_cost(self, harness_factory: Any) -> None:
        # Exempt regardless of cost: ingest still needs them to classify and price the span itself.
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^gen_ai\."), re.compile(r".*")]))
        h.llm_call(event={ATTRIBUTES.request_model: "gpt-4o", "detail": "x"}, **ATTRIBUTION)
        span = h.span()
        attrs = span.attributes or {}
        self._assert_only_attribution_survives(attrs)
        assert attrs["gen_ai.usage.input_tokens"] == FALLBACK_MASK
        assert ATTRIBUTES.cost_source not in attrs
        assert dict(span.events[0].attributes or {}) == {ATTRIBUTES.request_model: "gpt-4o", "detail": FALLBACK_MASK}

    def test_exact_string_pattern_still_redacts(self, harness_factory: Any) -> None:
        h = harness_factory(redact=RedactSpanProcessorOptions(attributes=[ATTRIBUTES.request_model, re.compile(r".*")]))
        h.llm_call(**ATTRIBUTION)
        attrs = h.span().attributes or {}
        assert attrs[ATTRIBUTES.request_model] == FALLBACK_MASK
        assert attrs[ATTRIBUTES.response_model] == ATTRIBUTION[ATTRIBUTES.response_model]
        assert attrs[ATTRIBUTES.operation_name] == "chat"

    def test_standalone_processor_applies_the_same_rule(self) -> None:
        redact = RedactSpanProcessor(attributes=[re.compile(r".*")])
        assert redact.redact_attributes({**ATTRIBUTION, "secret": "s"}) == {**ATTRIBUTION, "secret": FALLBACK_MASK}


class TestStandaloneRedactSpanProcessor:
    """`RedactSpanProcessor` / `RedactThenExportSpanProcessor` are public; they must work on a plain provider."""

    def test_redact_then_export_redacts_ended_span(self) -> None:
        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        redact = RedactSpanProcessor(attributes=[re.compile(r"^secret\.")])
        provider.add_span_processor(RedactThenExportSpanProcessor(redact, SimpleSpanProcessor(exporter)))
        tracer = provider.get_tracer("test")
        with tracer.start_as_current_span("op", attributes={"secret.key": "k", "keep": "v"}) as span:
            span.add_event("evt", attributes={"secret.e": "x"})
        (exported,) = exporter.get_finished_spans()
        assert dict(exported.attributes or {}) == {"secret.key": FALLBACK_MASK, "keep": "v"}
        assert dict(exported.events[0].attributes or {}) == {"secret.e": FALLBACK_MASK}
        provider.shutdown()

    def test_on_end_never_raises(self) -> None:
        provider = TracerProvider()
        provider.add_span_processor(RedactSpanProcessor(attributes=["secret"], mask=lambda k, v: 1 / 0))  # type: ignore[arg-type, return-value]
        with provider.get_tracer("test").start_as_current_span("op", attributes={"secret": "s"}):
            pass
        provider.shutdown()
