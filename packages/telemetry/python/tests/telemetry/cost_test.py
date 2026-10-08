"""Tests for customer-supplied LLM cost: capture(cost=...), pricing, cost_resolver and set_llm_cost."""

import re
from collections.abc import Iterator
from typing import Any

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry import (
    ATTRIBUTES,
    COST_SOURCE_USER,
    Latitude,
    LatitudeSpanProcessor,
    LlmCost,
    LlmUsage,
    capture,
    set_llm_cost,
)
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessorOptions
from latitude_telemetry.telemetry.redact_span_processor import RedactSpanProcessorOptions

COST_KEYS = (ATTRIBUTES.cost_input, ATTRIBUTES.cost_output, ATTRIBUTES.cost_total, ATTRIBUTES.cost_source)


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
        # A second, unrelated processor on the same provider must never see Latitude's cost.
        self.provider.add_span_processor(SimpleSpanProcessor(self.other_exporter))
        trace.set_tracer_provider(self.provider)
        self.tracer = self.provider.get_tracer("test.llm")

    def llm_call(self, name: str = "openai.chat", **attributes: Any) -> None:
        attrs: dict[str, Any] = {
            "gen_ai.operation.name": "chat",
            "gen_ai.system": "openai",
            "gen_ai.request.model": "gpt-4o",
            "gen_ai.usage.input_tokens": 1000,
            "gen_ai.usage.output_tokens": 500,
        }
        attrs.update(attributes)
        attrs = {k: v for k, v in attrs.items() if v is not None}
        with self.tracer.start_as_current_span(name, attributes=attrs):
            pass

    def spans(self) -> dict[str, ReadableSpan]:
        self.provider.force_flush()
        return {span.name: span for span in self.exporter.get_finished_spans()}

    def attrs(self, name: str) -> dict[str, Any]:
        return dict(self.spans()[name].attributes or {})

    def other_attrs(self, name: str) -> dict[str, Any]:
        return {span.name: dict(span.attributes or {}) for span in self.other_exporter.get_finished_spans()}[name]


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


def cost_of(attrs: dict[str, Any]) -> dict[str, Any]:
    return {k: attrs[k] for k in COST_KEYS if k in attrs}


PRICING = {"openai/gpt-4o": {"input_per_1m": 2.5, "output_per_1m": 10.0}}


class TestCaptureCost:
    def test_stamps_llm_child_span_not_wrapper(self, harness_factory: Any) -> None:
        h = harness_factory()
        capture("agent-run", lambda: h.llm_call(), cost={"input": 0.002, "output": 0.004})

        assert cost_of(h.attrs("openai.chat")) == {
            ATTRIBUTES.cost_input: 0.002,
            ATTRIBUTES.cost_output: 0.004,
            ATTRIBUTES.cost_total: pytest.approx(0.006),
            ATTRIBUTES.cost_source: COST_SOURCE_USER,
        }
        assert cost_of(h.attrs("agent-run")) == {}

    def test_options_dict_and_decorator_forms(self, harness_factory: Any) -> None:
        h = harness_factory()
        capture("dict-form", lambda: h.llm_call("call-a"), {"cost": {"total": 0.1}})

        @capture("decorated", cost={"total": 0.2})
        def run() -> None:
            h.llm_call("call-b")

        run()
        assert h.attrs("call-a")[ATTRIBUTES.cost_total] == 0.1
        assert h.attrs("call-b")[ATTRIBUTES.cost_total] == 0.2

    def test_non_llm_child_span_is_not_stamped(self, harness_factory: Any) -> None:
        h = harness_factory()

        def run() -> None:
            with h.tracer.start_as_current_span("db.query", attributes={"latitude.metadata": "{}"}):
                pass
            with h.tracer.start_as_current_span("tool", attributes={"gen_ai.operation.name": "execute_tool"}):
                pass

        capture("agent-run", run, cost={"total": 1.0})
        assert cost_of(h.attrs("db.query")) == {}
        assert cost_of(h.attrs("tool")) == {}

    def test_total_only_drops_instrumentor_sides(self, harness_factory: Any) -> None:
        h = harness_factory()
        capture(
            "agent-run",
            lambda: h.llm_call(
                **{
                    "gen_ai.usage.input_cost": 9.0,
                    "gen_ai.usage.output_cost": 9.0,
                    "gen_ai.usage.total_cost": 18.0,
                    "llm.cost.prompt": 9.0,
                }
            ),
            cost={"total": 0.5},
        )
        attrs = h.attrs("openai.chat")
        assert cost_of(attrs) == {ATTRIBUTES.cost_total: 0.5, ATTRIBUTES.cost_source: COST_SOURCE_USER}
        assert "llm.cost.prompt" not in attrs

    def test_input_output_overrides_stale_instrumentor_total(self, harness_factory: Any) -> None:
        h = harness_factory()
        capture(
            "agent-run",
            lambda: h.llm_call(**{"gen_ai.usage.total_cost": 18.0}),
            cost={"input": 1.0, "output": 2.0},
        )
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == 3.0

    def test_explicit_zero_is_honoured(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        capture("agent-run", lambda: h.llm_call(), cost={"input": 0, "output": 0})
        assert cost_of(h.attrs("openai.chat")) == {
            ATTRIBUTES.cost_input: 0.0,
            ATTRIBUTES.cost_output: 0.0,
            ATTRIBUTES.cost_total: 0.0,
            ATTRIBUTES.cost_source: COST_SOURCE_USER,
        }

    def test_invalid_cost_is_ignored(self, harness_factory: Any) -> None:
        h = harness_factory()
        bad: Any = {"input": -1, "output": True}
        capture("agent-run", lambda: h.llm_call(), cost=bad)
        assert cost_of(h.attrs("openai.chat")) == {}

    def test_nested_capture_inherits_and_overrides(self, harness_factory: Any) -> None:
        h = harness_factory()

        def outer() -> None:
            capture("inherit", lambda: h.llm_call("inherited"))
            capture("override", lambda: h.llm_call("overridden"), cost={"total": 2.0})

        capture("outer", outer, cost={"total": 1.0})
        assert h.attrs("inherited")[ATTRIBUTES.cost_total] == 1.0
        assert h.attrs("overridden")[ATTRIBUTES.cost_total] == 2.0

    def test_does_not_mutate_span_seen_by_other_processors(self, harness_factory: Any) -> None:
        h = harness_factory()
        capture("agent-run", lambda: h.llm_call(**{"gen_ai.usage.total_cost": 18.0}), cost={"total": 0.5})
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == 0.5
        other = h.other_attrs("openai.chat")
        assert other["gen_ai.usage.total_cost"] == 18.0
        assert ATTRIBUTES.cost_source not in other


class TestPricing:
    def test_computes_cost_from_tokens(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        h.llm_call(**{"gen_ai.system": "OpenAI"})  # provider match is case-insensitive
        attrs = h.attrs("openai.chat")
        assert attrs[ATTRIBUTES.cost_input] == pytest.approx(0.0025)
        assert attrs[ATTRIBUTES.cost_output] == pytest.approx(0.005)
        assert attrs[ATTRIBUTES.cost_total] == pytest.approx(0.0075)
        assert attrs[ATTRIBUTES.cost_source] == COST_SOURCE_USER

    def test_prefers_response_model_then_request_model(self, harness_factory: Any) -> None:
        pricing = {**PRICING, "openai/gpt-4o-2024-08-06": {"input_per_1m": 1.0, "output_per_1m": 1.0}}
        h = harness_factory(pricing=pricing)
        h.llm_call("dated", **{"gen_ai.response.model": "gpt-4o-2024-08-06"})
        h.llm_call("unknown-response", **{"gen_ai.response.model": "gpt-4o-unknown"})
        assert h.attrs("dated")[ATTRIBUTES.cost_total] == pytest.approx(0.0015)
        assert h.attrs("unknown-response")[ATTRIBUTES.cost_total] == pytest.approx(0.0075)

    def test_missing_model_leaves_span_untouched(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        h.llm_call(**{"gen_ai.request.model": "claude-x", "gen_ai.usage.total_cost": 0.42})
        attrs = h.attrs("openai.chat")
        assert attrs["gen_ai.usage.total_cost"] == 0.42
        assert ATTRIBUTES.cost_source not in attrs

    def test_openinference_attributes_and_input_only_rate(self, harness_factory: Any) -> None:
        h = harness_factory(pricing={"openai/text-embedding-3-small": {"input_per_1m": 0.02}})
        with h.tracer.start_as_current_span(
            "embed",
            attributes={
                "openinference.span.kind": "EMBEDDING",
                "llm.provider": "openai",
                "llm.model_name": "text-embedding-3-small",
                "llm.token_count.prompt": 1_000_000,
            },
        ):
            pass
        attrs = h.attrs("embed")
        assert attrs[ATTRIBUTES.cost_input] == pytest.approx(0.02)
        assert attrs[ATTRIBUTES.cost_output] == 0.0
        assert attrs[ATTRIBUTES.cost_total] == pytest.approx(0.02)

    def test_no_tokens_means_no_pricing(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        h.llm_call(**{"gen_ai.usage.input_tokens": None, "gen_ai.usage.output_tokens": None})
        assert cost_of(h.attrs("openai.chat")) == {}

    def test_wrapper_span_is_not_priced(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        capture("agent-run", lambda: h.llm_call())
        assert cost_of(h.attrs("agent-run")) == {}
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_source] == COST_SOURCE_USER

    def test_vercel_ai_sdk_attributes(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        with h.tracer.start_as_current_span(
            "ai.generateText.doGenerate",
            attributes={
                "ai.operationId": "ai.generateText.doGenerate",
                "ai.model.provider": "openai.chat",
                "ai.model.id": "gpt-4o",
                "ai.usage.promptTokens": 1000,
                "ai.usage.completionTokens": 500,
            },
        ):
            pass
        assert h.attrs("ai.generateText.doGenerate")[ATTRIBUTES.cost_total] == pytest.approx(0.0075)

    def test_crewai_agent_span_is_an_llm_call(self, harness_factory: Any) -> None:
        h = harness_factory()
        crewai = h.provider.get_tracer("openinference.instrumentation.crewai")
        other = h.provider.get_tracer("openinference.instrumentation.langchain")

        def run() -> None:
            with crewai.start_as_current_span("crew-agent", attributes={"openinference.span.kind": "AGENT"}):
                pass
            with other.start_as_current_span("other-agent", attributes={"openinference.span.kind": "AGENT"}):
                pass

        capture("crew", run, cost={"total": 0.4})
        assert h.attrs("crew-agent")[ATTRIBUTES.cost_total] == 0.4
        assert cost_of(h.attrs("other-agent")) == {}

    def test_cost_is_resolved_before_redaction(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING, redact=RedactSpanProcessorOptions(attributes=[re.compile(r"^gen_ai\.")]))
        h.llm_call()
        attrs = h.attrs("openai.chat")
        assert attrs["gen_ai.request.model"] == "******"
        assert attrs[ATTRIBUTES.cost_total] == pytest.approx(0.0075)
        assert attrs[ATTRIBUTES.cost_source] == COST_SOURCE_USER


class TestCostResolver:
    def test_receives_usage_and_sets_cost(self, harness_factory: Any) -> None:
        seen: list[LlmUsage] = []

        def resolver(usage: LlmUsage) -> LlmCost | None:
            seen.append(usage)
            return {"total": 0.25}

        h = harness_factory(cost_resolver=resolver, pricing=PRICING)
        h.llm_call(**{"gen_ai.response.model": "gpt-4o-2024-08-06"})
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == 0.25
        assert ATTRIBUTES.cost_input not in h.attrs("openai.chat")
        usage = seen[0]
        assert (usage.provider, usage.model, usage.input_tokens, usage.output_tokens) == (
            "openai",
            "gpt-4o-2024-08-06",
            1000,
            500,
        )
        assert usage.operation == "chat"
        assert usage.attributes["gen_ai.request.model"] == "gpt-4o"

    def test_none_falls_back_to_pricing(self, harness_factory: Any) -> None:
        h = harness_factory(cost_resolver=lambda _usage: None, pricing=PRICING)
        h.llm_call()
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == pytest.approx(0.0075)

    def test_raising_resolver_falls_back_without_breaking_export(self, harness_factory: Any) -> None:
        def boom(_usage: LlmUsage) -> LlmCost | None:
            raise RuntimeError("boom")

        h = harness_factory(cost_resolver=boom, pricing=PRICING)
        h.llm_call()
        h.llm_call("unpriced", **{"gen_ai.request.model": "other"})
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == pytest.approx(0.0075)
        assert cost_of(h.attrs("unpriced")) == {}

    def test_explicit_zero_from_resolver(self, harness_factory: Any) -> None:
        h = harness_factory(cost_resolver=lambda _usage: {"input": 0.0, "output": 0.0}, pricing=PRICING)
        h.llm_call()
        assert h.attrs("openai.chat")[ATTRIBUTES.cost_total] == 0.0


class TestPrecedence:
    def test_capture_beats_resolver_beats_pricing(self, harness_factory: Any) -> None:
        h = harness_factory(
            cost_resolver=lambda usage: {"total": 0.3} if usage.model == "gpt-4o" else None,
            pricing={**PRICING, "openai/gpt-4o-mini": {"input_per_1m": 1.0, "output_per_1m": 1.0}},
        )
        capture("captured", lambda: h.llm_call("by-capture"), cost={"total": 0.9})
        h.llm_call("by-resolver")
        h.llm_call("by-pricing", **{"gen_ai.request.model": "gpt-4o-mini"})
        assert h.attrs("by-capture")[ATTRIBUTES.cost_total] == 0.9
        assert h.attrs("by-resolver")[ATTRIBUTES.cost_total] == 0.3
        assert h.attrs("by-pricing")[ATTRIBUTES.cost_total] == pytest.approx(0.0015)

    def test_set_llm_cost_beats_everything(self, harness_factory: Any) -> None:
        h = harness_factory(cost_resolver=lambda _usage: {"total": 0.3}, pricing=PRICING)

        def run() -> None:
            with h.tracer.start_as_current_span(
                "manual",
                attributes={
                    "gen_ai.operation.name": "chat",
                    "gen_ai.system": "openai",
                    "gen_ai.request.model": "gpt-4o",
                    "gen_ai.usage.input_tokens": 10,
                },
            ) as span:
                set_llm_cost(span, input=0.01, output=0.02)
                live = dict(span.attributes or {})  # type: ignore[attr-defined]
                assert live[ATTRIBUTES.cost_source] == COST_SOURCE_USER
                assert live[ATTRIBUTES.cost_total] == pytest.approx(0.03)
                # An instrumentor writing cost later must not win over the explicit value.
                span.set_attribute("gen_ai.usage.total_cost", 99.0)

        capture("agent-run", run, cost={"total": 0.9})
        assert cost_of(h.attrs("manual")) == {
            ATTRIBUTES.cost_input: 0.01,
            ATTRIBUTES.cost_output: 0.02,
            ATTRIBUTES.cost_total: pytest.approx(0.03),
            ATTRIBUTES.cost_source: COST_SOURCE_USER,
        }

    def test_set_llm_cost_total_only_drops_instrumentor_sides(self, harness_factory: Any) -> None:
        h = harness_factory()
        with h.tracer.start_as_current_span(
            "manual", attributes={"gen_ai.usage.input_cost": 5.0, "gen_ai.usage.output_cost": 5.0}
        ) as span:
            set_llm_cost(span, total=0)
        assert cost_of(h.attrs("manual")) == {ATTRIBUTES.cost_total: 0.0, ATTRIBUTES.cost_source: COST_SOURCE_USER}

    def test_set_llm_cost_without_values_is_a_noop(self, harness_factory: Any) -> None:
        h = harness_factory()
        with h.tracer.start_as_current_span("manual", attributes={"gen_ai.operation.name": "chat"}) as span:
            set_llm_cost(span)
        assert cost_of(h.attrs("manual")) == {}

    def test_user_marked_span_is_trusted_as_is(self, harness_factory: Any) -> None:
        h = harness_factory(pricing=PRICING)
        h.llm_call(**{ATTRIBUTES.cost_source: COST_SOURCE_USER, "gen_ai.usage.total_cost": 0.7})
        assert cost_of(h.attrs("openai.chat")) == {
            ATTRIBUTES.cost_total: 0.7,
            ATTRIBUTES.cost_source: COST_SOURCE_USER,
        }

    def test_no_sdk_cost_leaves_instrumentor_cost_alone(self, harness_factory: Any) -> None:
        h = harness_factory()
        h.llm_call(**{"gen_ai.usage.input_cost": 1.0, "gen_ai.usage.total_cost": 1.5})
        assert cost_of(h.attrs("openai.chat")) == {ATTRIBUTES.cost_input: 1.0, ATTRIBUTES.cost_total: 1.5}


class TestLatitudeBootstrap:
    def test_constructor_wires_pricing_and_resolver(self) -> None:
        exporter = InMemorySpanExporter()
        latitude = Latitude(
            api_key="fake-api-key",
            project="p",
            disable_batch=True,
            exporter=exporter,
            pricing=PRICING,
            cost_resolver=lambda usage: {"total": 1.0} if usage.model == "special" else None,
        )
        try:
            tracer = latitude.provider.get_tracer("test.llm")
            for name, model in (("priced", "gpt-4o"), ("resolved", "special")):
                with tracer.start_as_current_span(
                    name,
                    attributes={
                        "gen_ai.operation.name": "chat",
                        "gen_ai.system": "openai",
                        "gen_ai.request.model": model,
                        "gen_ai.usage.input_tokens": 1000,
                        "gen_ai.usage.output_tokens": 500,
                    },
                ):
                    pass
            latitude.flush()
            spans = {span.name: dict(span.attributes or {}) for span in exporter.get_finished_spans()}
            assert spans["priced"][ATTRIBUTES.cost_total] == pytest.approx(0.0075)
            assert spans["resolved"][ATTRIBUTES.cost_total] == 1.0
        finally:
            latitude.shutdown()
