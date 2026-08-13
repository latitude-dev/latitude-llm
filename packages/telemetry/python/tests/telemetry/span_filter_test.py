"""Tests for smart span export filtering."""

from unittest.mock import Mock

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from latitude_telemetry.constants import SCOPE_LATITUDE
from latitude_telemetry.telemetry.span_filter import (
    ExportFilterSpanProcessor,
    build_should_export_span,
    is_default_export_span,
    is_gen_ai_or_llm_attribute_span,
    is_latitude_instrumentation_span,
)


def _readable_span(*, scope_name: str = "", attributes: dict | None = None):
    span = Mock()
    scope = Mock()
    scope.name = scope_name
    span.instrumentation_scope = scope
    span.attributes = attributes or {}
    return span


class TestIsLatitudeInstrumentationSpan:
    def test_matches_nested_scope(self) -> None:
        assert is_latitude_instrumentation_span(_readable_span(scope_name=f"{SCOPE_LATITUDE}.manual"))

    def test_rejects_foreign_scope(self) -> None:
        assert not is_latitude_instrumentation_span(_readable_span(scope_name="express"))


class TestIsGenAiOrLlmAttributeSpan:
    def test_gen_ai_prefix(self) -> None:
        assert is_gen_ai_or_llm_attribute_span(
            _readable_span(attributes={"gen_ai.request.model": "gpt-4"}),
        )

    def test_http_only(self) -> None:
        assert not is_gen_ai_or_llm_attribute_span(
            _readable_span(attributes={"http.method": "GET"}),
        )


class TestIsDefaultExportSpan:
    def test_rejects_http_instrumentation(self) -> None:
        assert not is_default_export_span(
            _readable_span(
                scope_name="opentelemetry.instrumentation.requests",
                attributes={"http.method": "GET"},
            ),
        )

    def test_accepts_openai_instrumentation(self) -> None:
        assert is_default_export_span(_readable_span(scope_name="opentelemetry.instrumentation.openai"))

    def test_accepts_openinference_instrumentation(self) -> None:
        assert is_default_export_span(_readable_span(scope_name="openinference.instrumentation.langchain"))

    def test_accepts_traceloop_substring(self) -> None:
        assert is_default_export_span(_readable_span(scope_name="traceloop.instrumentation.openai"))

    def test_accepts_langsmith_substring(self) -> None:
        assert is_default_export_span(_readable_span(scope_name="my.langsmith.tracer"))

    def test_accepts_litellm_substring(self) -> None:
        assert is_default_export_span(_readable_span(scope_name="litellm.proxy"))


class TestBuildShouldExportSpan:
    def test_disable_smart_filter(self) -> None:
        pred = build_should_export_span(disable_smart_filter=True)
        assert pred(_readable_span(scope_name="opentelemetry.instrumentation.requests"))

    def test_blocked_scopes(self) -> None:
        pred = build_should_export_span(
            blocked_instrumentation_scopes=["opentelemetry.instrumentation.openai"],
        )
        assert not pred(_readable_span(scope_name="opentelemetry.instrumentation.openai"))
        assert pred(_readable_span(scope_name="opentelemetry.instrumentation.anthropic"))

    def test_should_export_span_extra(self) -> None:
        pred = build_should_export_span(
            should_export_span=lambda s: s.instrumentation_scope.name == "custom.scope",
        )
        assert pred(_readable_span(scope_name="custom.scope"))
        assert not pred(_readable_span(scope_name="express"))


class TestExportFilterParentChainPromotion:
    def setup_method(self) -> None:
        self.exporter = InMemorySpanExporter()
        self.provider = TracerProvider()
        self.provider.add_span_processor(
            ExportFilterSpanProcessor(
                build_should_export_span(),
                SimpleSpanProcessor(self.exporter),
            )
        )

    def teardown_method(self) -> None:
        self.provider.shutdown()
        self.exporter.clear()

    def test_exports_unstamped_parent_when_kept_child_ends_first(self) -> None:
        tracer = self.provider.get_tracer("opentelemetry.instrumentation.net")
        parent = tracer.start_span("tcp.connect.parent")
        child = tracer.start_span(
            "tcp.connect",
            context=trace.set_span_in_context(parent),
            attributes={"latitude.tags": '["flagger"]'},
        )
        child.end()
        parent.end()
        self.provider.force_flush()

        names = sorted(span.name for span in self.exporter.get_finished_spans())
        assert names == ["tcp.connect", "tcp.connect.parent"]

    def test_flushes_already_dropped_parent_when_child_kept(self) -> None:
        tracer = self.provider.get_tracer("opentelemetry.instrumentation.net")
        parent = tracer.start_span("http.request")
        child_ctx = trace.set_span_in_context(parent)
        parent.end()

        child = tracer.start_span(
            "tcp.connect",
            context=child_ctx,
            attributes={"latitude.capture.name": "flagger.draft"},
        )
        child.end()
        self.provider.force_flush()

        names = sorted(span.name for span in self.exporter.get_finished_spans())
        assert names == ["http.request", "tcp.connect"]

    def test_still_drops_spans_with_no_kept_descendant(self) -> None:
        tracer = self.provider.get_tracer("opentelemetry.instrumentation.net")
        parent = tracer.start_span("dns.lookup")
        child = tracer.start_span("tcp.connect", context=trace.set_span_in_context(parent))
        child.end()
        parent.end()
        self.provider.force_flush()

        assert self.exporter.get_finished_spans() == ()

    def test_promotes_multi_level_ancestor_chain(self) -> None:
        tracer = self.provider.get_tracer("opentelemetry.instrumentation.net")
        root = tracer.start_span("http.request")
        mid = tracer.start_span("tls.connect", context=trace.set_span_in_context(root))
        leaf = tracer.start_span(
            "tcp.connect",
            context=trace.set_span_in_context(mid),
            attributes={"gen_ai.request.model": "gpt-4"},
        )
        leaf.end()
        mid.end()
        root.end()
        self.provider.force_flush()

        names = sorted(span.name for span in self.exporter.get_finished_spans())
        assert names == ["http.request", "tcp.connect", "tls.connect"]
