"""
Export-time view of a span: redaction plus the SDK's cost, without touching the span.

Ended spans are frozen by OpenTelemetry and shared with every other processor on the host
TracerProvider, so Latitude never writes into them. `ExportViewExporter` wraps each exported span
in a ReadableSpan-shaped view whose `attributes` / `events` are redacted copies with the SDK's cost
written on top. Order:

1. Cost was already resolved at `on_end` from the unredacted span (`SpanCostTracker`).
2. Redaction masks matching span and event attributes.
3. The SDK's cost attributes are written last, so a broad pattern such as `^gen_ai\\.` never masks a
   cost the SDK computed. Instrumentor-written cost on spans the SDK doesn't price is redacted
   like any other attribute.
4. The inner exporter (e.g. the `service.name` resource override) sees the view.
"""

import logging
import typing
from collections.abc import Mapping, Sequence

from opentelemetry.sdk.trace import Event, ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

from latitude_telemetry.telemetry.cost import SpanCostTracker, apply_cost
from latitude_telemetry.telemetry.redact_span_processor import FALLBACK_MASK, RedactSpanProcessor

logger = logging.getLogger(__name__)


class _SpanView:
    """ReadableSpan-shaped view that replaces `attributes` and/or `events` and delegates the rest."""

    def __init__(
        self,
        span: ReadableSpan,
        attributes: Mapping[str, typing.Any] | None,
        events: Sequence[Event] | None,
    ) -> None:
        self._span = span
        self._attributes_override = attributes
        self._events_override = tuple(events) if events is not None else None

    @property
    def attributes(self) -> Mapping[str, typing.Any]:
        if self._attributes_override is not None:
            return self._attributes_override
        return self._span.attributes or {}

    @property
    def events(self) -> Sequence[Event]:
        if self._events_override is not None:
            return self._events_override
        return self._span.events

    def __getattr__(self, name: str) -> typing.Any:
        return getattr(self._span, name)


class ExportViewExporter(SpanExporter):
    """Wraps a SpanExporter and exports a redacted, cost-stamped view of each span (see module doc)."""

    def __init__(
        self,
        inner: SpanExporter,
        *,
        cost_tracker: SpanCostTracker,
        redact: RedactSpanProcessor | None,
    ) -> None:
        self._inner = inner
        self._cost_tracker = cost_tracker
        self._redact = redact

    def export(self, spans: typing.Sequence[ReadableSpan]) -> SpanExportResult:
        return self._inner.export([self._view(span) for span in spans])

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)

    def _view(self, span: ReadableSpan) -> ReadableSpan:
        attributes, events = self._redacted(span)
        cost = self._cost_tracker.cost_for(span)
        if cost is not None:
            attributes = apply_cost(attributes if attributes is not None else span.attributes or {}, cost)
        if attributes is None and events is None:
            return span
        return typing.cast(ReadableSpan, _SpanView(span, attributes, events))

    def _redacted(self, span: ReadableSpan) -> tuple[dict[str, typing.Any] | None, list[Event] | None]:
        if self._redact is None:
            return None, None
        try:
            return self._redact.redact_attributes(span.attributes), self._redact.redact_events(span.events)
        except Exception:
            # Per-value failures are already masked inside the redactor; reaching here means the span
            # itself couldn't be read. Fail closed: mask every attribute value and drop events rather
            # than export raw values or lose the span.
            logger.warning(
                "[Latitude] Failed to redact span %r; masking all attributes",
                getattr(span, "name", None),
                exc_info=True,
            )
            try:
                masked = dict.fromkeys(span.attributes or {}, FALLBACK_MASK)
            except Exception:
                masked = {}
            return masked, []
