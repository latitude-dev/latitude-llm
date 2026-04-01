"""
Smart export filter: only LLM-relevant spans are sent to Latitude by default.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor

from latitude_telemetry.constants import SCOPE_LATITUDE

GEN_AI_PREFIX = "gen_ai."
LLM_PREFIX = "llm."
OPENINFERENCE_KIND = "openinference.span.kind"

OTEL_LLM_INSTRUMENTATION_SCOPE_PREFIXES: tuple[str, ...] = (
    "opentelemetry.instrumentation.alephalpha",
    "opentelemetry.instrumentation.anthropic",
    "opentelemetry.instrumentation.bedrock",
    "opentelemetry.instrumentation.cohere",
    "opentelemetry.instrumentation.crewai",
    "opentelemetry.instrumentation.google_generativeai",
    "opentelemetry.instrumentation.groq",
    "opentelemetry.instrumentation.haystack",
    "opentelemetry.instrumentation.langchain",
    "opentelemetry.instrumentation.llamaindex",
    "opentelemetry.instrumentation.mistralai",
    "opentelemetry.instrumentation.ollama",
    "opentelemetry.instrumentation.openai",
    "opentelemetry.instrumentation.replicate",
    "opentelemetry.instrumentation.sagemaker",
    "opentelemetry.instrumentation.together",
    "opentelemetry.instrumentation.transformers",
    "opentelemetry.instrumentation.vertexai",
    "opentelemetry.instrumentation.watsonx",
    "openinference.instrumentation",
)

LLM_SCOPE_SUBSTRINGS: tuple[str, ...] = ("openinference", "traceloop", "langsmith", "litellm")


def _attribute_keys(span: ReadableSpan) -> list[str]:
    attrs = getattr(span, "attributes", None)
    if not attrs:
        return []
    return list(attrs.keys())


def _instrumentation_scope_name(span: ReadableSpan) -> str:
    scope = getattr(span, "instrumentation_scope", None)
    if scope is None:
        return ""
    return getattr(scope, "name", "") or ""


def is_gen_ai_or_llm_attribute_span(span: ReadableSpan) -> bool:
    for key in _attribute_keys(span):
        if key.startswith(GEN_AI_PREFIX) or key.startswith(LLM_PREFIX):
            return True
        if key == OPENINFERENCE_KIND or key.startswith("openinference."):
            return True
        # Vercel AI SDK uses ai.* prefix
        if key.startswith("ai."):
            return True
        if key.startswith("latitude."):
            return True
    return False


def is_latitude_instrumentation_span(span: ReadableSpan) -> bool:
    name = _instrumentation_scope_name(span)
    return name == SCOPE_LATITUDE or name.startswith(f"{SCOPE_LATITUDE}.")


def _is_known_llm_instrumentation_scope(span: ReadableSpan) -> bool:
    name = _instrumentation_scope_name(span)
    if not name:
        return False
    for prefix in OTEL_LLM_INSTRUMENTATION_SCOPE_PREFIXES:
        if name == prefix or name.startswith(f"{prefix}."):
            return True
    lower = name.lower()
    return any(part in lower for part in LLM_SCOPE_SUBSTRINGS)


def is_default_export_span(span: ReadableSpan) -> bool:
    if is_latitude_instrumentation_span(span):
        return True
    if is_gen_ai_or_llm_attribute_span(span):
        return True
    if _is_known_llm_instrumentation_scope(span):
        return True
    return False


@dataclass
class SmartFilterOptions:
    """Options for the default export predicate."""

    disable_smart_filter: bool = False
    should_export_span: Callable[[ReadableSpan], bool] | None = None
    blocked_instrumentation_scopes: tuple[str, ...] = ()


def build_should_export_span(
    *,
    disable_smart_filter: bool = False,
    should_export_span: Callable[[ReadableSpan], bool] | None = None,
    blocked_instrumentation_scopes: Sequence[str] | None = None,
) -> Callable[[ReadableSpan], bool]:
    if disable_smart_filter:
        return lambda _span: True
    blocked = set(blocked_instrumentation_scopes or ())
    extra = should_export_span

    def should_export(span: ReadableSpan) -> bool:
        scope = _instrumentation_scope_name(span)
        if scope in blocked:
            return False
        if is_default_export_span(span):
            return True
        if extra is not None and extra(span):
            return True
        return False

    return should_export


class ExportFilterSpanProcessor(SpanProcessor):
    """Drops spans that fail the export predicate before passing them to the inner processor."""

    def __init__(
        self,
        should_export: Callable[[ReadableSpan], bool],
        inner: SpanProcessor,
    ) -> None:
        self._should_export = should_export
        self._inner = inner

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        self._inner.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        if not self._should_export(span):
            return
        self._inner.on_end(span)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)


class RedactThenExportSpanProcessor(SpanProcessor):
    """Runs optional redaction then the batch/simple export processor."""

    def __init__(
        self,
        redact: SpanProcessor | None,
        export_processor: SpanProcessor,
    ) -> None:
        self._redact = redact
        self._export_processor = export_processor

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        if self._redact is not None:
            self._redact.on_start(span, parent_context)
        self._export_processor.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        if self._redact is not None:
            self._redact.on_end(span)
        self._export_processor.on_end(span)

    def shutdown(self) -> None:
        self._export_processor.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._export_processor.force_flush(timeout_millis)
