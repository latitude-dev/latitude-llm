from collections.abc import Mapping
from typing import cast

from opentelemetry import context as otel_context
from opentelemetry.baggage import get_all
from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor


class BaggageSpanProcessor(SpanProcessor):
    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        raw_baggage = cast(
            Mapping[object, object],
            get_all(parent_context) if parent_context is not None else {},
        )
        if not raw_baggage:
            raw_baggage = cast(Mapping[object, object], get_all(otel_context.get_current()))

        baggage_items: dict[str, object] = {}
        for key, value in raw_baggage.items():
            baggage_items[str(key)] = value

        for key, value in baggage_items.items():
            if value is None:
                continue
            span.set_attribute(key, str(value))

    def on_end(self, span: ReadableSpan) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True
