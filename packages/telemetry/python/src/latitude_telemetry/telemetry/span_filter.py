"""
Smart export filter: only LLM-relevant spans are sent to Latitude by default.
"""

from __future__ import annotations

import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor
from opentelemetry.trace import INVALID_SPAN_ID, format_span_id, get_current_span

from latitude_telemetry.constants import SCOPE_LATITUDE

GEN_AI_PREFIX = "gen_ai."
LLM_PREFIX = "llm."
OPENINFERENCE_KIND = "openinference.span.kind"

_MAX_TRACKED_SPANS = 2048

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


@dataclass(frozen=True)
class _DroppedSpanEntry:
    span: ReadableSpan
    recorded_parent_id: str | None


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


def _span_id(span: ReadableSpan | Span) -> str | None:
    ctx = span.get_span_context()
    if ctx is None or ctx.span_id == INVALID_SPAN_ID:
        return None
    return format_span_id(ctx.span_id)


def _parent_span_id(span: ReadableSpan | Span) -> str | None:
    parent = getattr(span, "parent", None)
    if parent is None:
        return None
    span_id = getattr(parent, "span_id", None)
    if span_id is None or span_id == INVALID_SPAN_ID:
        return None
    return format_span_id(span_id)


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
    """Drops filtered spans; when a span is kept, also exports its ancestors."""

    def __init__(
        self,
        should_export: Callable[[ReadableSpan], bool],
        inner: SpanProcessor,
        *,
        blocked_instrumentation_scopes: Sequence[str] | None = None,
    ) -> None:
        self._should_export = should_export
        self._inner = inner
        self._blocked_scopes = frozenset(blocked_instrumentation_scopes or ())
        self._lock = threading.Lock()
        self._parent_by_span_id: dict[str, str | None] = {}
        self._force_export_ids: set[str] = set()
        self._dropped_by_span_id: dict[str, _DroppedSpanEntry] = {}

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        span_id = _span_id(span)
        if span_id is not None:
            parent_id = _parent_span_id(span)
            if parent_id is None and parent_context is not None:
                parent_ctx = get_current_span(parent_context).get_span_context()
                if parent_ctx.is_valid and parent_ctx.span_id != INVALID_SPAN_ID:
                    parent_id = format_span_id(parent_ctx.span_id)
            with self._lock:
                if len(self._parent_by_span_id) >= _MAX_TRACKED_SPANS:
                    oldest = next(iter(self._parent_by_span_id))
                    del self._parent_by_span_id[oldest]
                self._parent_by_span_id[span_id] = parent_id
        self._inner.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        to_export: list[ReadableSpan] = []
        with self._lock:
            span_id = _span_id(span)
            recorded_parent_id = self._parent_by_span_id.pop(span_id, None) if span_id is not None else None
            forced = span_id is not None and span_id in self._force_export_ids
            if span_id is not None:
                self._force_export_ids.discard(span_id)

            if self._is_blocked(span):
                self._remember_dropped(span, recorded_parent_id)
                if forced:
                    to_export.extend(self._collect_promoted_ancestors(span, recorded_parent_id))
            elif not forced and not self._should_export(span):
                self._remember_dropped(span, recorded_parent_id)
            else:
                if span_id is not None:
                    self._dropped_by_span_id.pop(span_id, None)
                to_export.extend(self._collect_promoted_ancestors(span, recorded_parent_id))
                to_export.append(span)

        for export_span in to_export:
            self._inner.on_end(export_span)

    def shutdown(self) -> None:
        with self._lock:
            self._parent_by_span_id.clear()
            self._force_export_ids.clear()
            self._dropped_by_span_id.clear()
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)

    def _is_blocked(self, span: ReadableSpan) -> bool:
        return _instrumentation_scope_name(span) in self._blocked_scopes

    def _remember_dropped(self, span: ReadableSpan, recorded_parent_id: str | None) -> None:
        span_id = _span_id(span)
        if span_id is None:
            return
        if len(self._dropped_by_span_id) >= _MAX_TRACKED_SPANS:
            oldest = next(iter(self._dropped_by_span_id))
            del self._dropped_by_span_id[oldest]
        self._dropped_by_span_id[span_id] = _DroppedSpanEntry(span=span, recorded_parent_id=recorded_parent_id)

    def _collect_promoted_ancestors(
        self,
        span: ReadableSpan,
        recorded_parent_id: str | None,
    ) -> list[ReadableSpan]:
        to_export: list[ReadableSpan] = []
        parent_id = _parent_span_id(span) or recorded_parent_id
        seen: set[str] = set()

        while parent_id and parent_id not in seen:
            seen.add(parent_id)

            dropped = self._dropped_by_span_id.pop(parent_id, None)
            if dropped is not None:
                to_export.extend(
                    self._collect_promoted_ancestors(dropped.span, dropped.recorded_parent_id),
                )
                if not self._is_blocked(dropped.span):
                    to_export.append(dropped.span)
                parent_id = _parent_span_id(dropped.span) or dropped.recorded_parent_id
                continue

            if parent_id in self._parent_by_span_id:
                if len(self._force_export_ids) >= _MAX_TRACKED_SPANS:
                    self._force_export_ids.pop()
                self._force_export_ids.add(parent_id)
                parent_id = self._parent_by_span_id.get(parent_id)
                continue

            break

        return to_export


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
