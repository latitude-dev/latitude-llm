from opentelemetry import context as otel_context
from opentelemetry.baggage import get_all
from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor


class BaggageSpanProcessor(SpanProcessor):
    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        baggage_items = get_all(parent_context) if parent_context is not None else {}
        if not baggage_items:
            baggage_items = get_all(otel_context.get_current())

        for key, value in baggage_items.items():
            if value is None:
                continue
            span.set_attribute(str(key), str(value))

    def on_end(self, span: ReadableSpan) -> None:
        return None

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True
