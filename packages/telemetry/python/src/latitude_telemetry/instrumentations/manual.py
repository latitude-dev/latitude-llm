"""
Manual instrumentation — exposes OTel tracer primitives for custom span creation.
"""

from dataclasses import dataclass
from typing import Any, Dict, List
from urllib.parse import unquote

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.baggage import set_baggage
from opentelemetry.context import Context
from opentelemetry.trace import Tracer

from latitude_telemetry.instrumentations.base import BaseInstrumentation


@dataclass
class TraceContext:
    """Context for resuming a trace from external sources."""

    traceparent: str
    baggage: str | None = None


@dataclass
class CaptureOptions:
    """Options for capture method — trace-wide context attributes."""

    name: str | None = None
    tags: List[str] | None = None
    metadata: Dict[str, Any] | None = None
    session_id: str | None = None
    user_id: str | None = None


class ManualInstrumentation(BaseInstrumentation):
    """
    Thin wrapper around OpenTelemetry tracer.
    Exposes the tracer directly for creating custom spans.
    """

    def __init__(self, tracer: Tracer):
        self._enabled = False
        self._tracer = tracer

    @property
    def tracer(self) -> Tracer:
        """The underlying OpenTelemetry tracer for creating custom spans."""
        return self._tracer

    def is_enabled(self) -> bool:
        return self._enabled

    def enable(self) -> None:
        self._enabled = True

    def disable(self) -> None:
        self._enabled = False

    def resume(self, ctx: TraceContext) -> Context:
        """Resume a trace from a TraceContext (traceparent + baggage)."""
        parts = ctx.traceparent.split("-")
        if len(parts) != 4:
            return otel_context.get_current()

        _, trace_id, span_id, flags = parts
        if not trace_id or not span_id:
            return otel_context.get_current()

        span_context = trace.SpanContext(
            trace_id=int(trace_id, 16),
            span_id=int(span_id, 16),
            is_remote=True,
            trace_flags=trace.TraceFlags(int(flags, 16)),
        )

        context = trace.set_span_in_context(trace.NonRecordingSpan(span_context), otel_context.get_current())

        if ctx.baggage:
            for pair in ctx.baggage.split(","):
                if "=" in pair:
                    key, value = pair.split("=", 1)
                    if key and value:
                        context = set_baggage(key, unquote(value), context)

        return context
