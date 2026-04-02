"""Tests for smart span export filtering."""

from unittest.mock import Mock

from latitude_telemetry.constants import SCOPE_LATITUDE
from latitude_telemetry.telemetry.span_filter import (
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
