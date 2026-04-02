"""
Composite span processor that sends traces to Latitude.

Add this to an existing OTel TracerProvider to export spans to Latitude
without replacing your current telemetry setup.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor

from latitude_telemetry.constants import ATTRIBUTES
from latitude_telemetry.env import env
from latitude_telemetry.exporter import ExporterOptions, create_exporter
from latitude_telemetry.sdk.context import get_latitude_context
from latitude_telemetry.telemetry.redact_span_processor import (
    RedactSpanProcessor,
    RedactSpanProcessorOptions,
    default_redact_span_processor,
)
from latitude_telemetry.telemetry.span_filter import (
    ExportFilterSpanProcessor,
    RedactThenExportSpanProcessor,
    build_should_export_span,
)


@dataclass
class LatitudeSpanProcessorOptions:
    disable_redact: bool = False
    redact: RedactSpanProcessorOptions | None = None
    disable_batch: bool = False
    disable_smart_filter: bool = False
    should_export_span: Callable[[ReadableSpan], bool] | None = None
    blocked_instrumentation_scopes: tuple[str, ...] = ()


class LatitudeSpanProcessor(SpanProcessor):
    """
    Composite span processor that sends traces to Latitude.

    Reads Latitude context from OTel context and stamps attributes onto spans.
    Chains processors internally for filtering, redaction, and export.
    """

    def __init__(
        self,
        api_key: str,
        project_slug: str,
        options: LatitudeSpanProcessorOptions | None = None,
    ):
        options = options or LatitudeSpanProcessorOptions()

        exporter = create_exporter(
            ExporterOptions(
                api_key=api_key,
                project_slug=project_slug,
                endpoint=env.EXPORTER_URL,
                timeout=30,
            )
        )

        if options.disable_redact:
            redact: RedactSpanProcessor | None = None
        elif options.redact:
            redact = RedactSpanProcessor(
                attributes=options.redact.attributes,
                mask=options.redact.mask,
            )
        else:
            redact = default_redact_span_processor()

        batch_or_simple: SpanProcessor = (
            SimpleSpanProcessor(exporter) if options.disable_batch else BatchSpanProcessor(exporter)
        )

        should_export = build_should_export_span(
            disable_smart_filter=options.disable_smart_filter,
            should_export_span=options.should_export_span,
            blocked_instrumentation_scopes=options.blocked_instrumentation_scopes,
        )
        redact_then_export = RedactThenExportSpanProcessor(redact, batch_or_simple)
        self._tail: SpanProcessor = ExportFilterSpanProcessor(should_export, redact_then_export)

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        # Read Latitude context from OTel context and stamp onto span
        # Try parent_context first, then fall back to current context
        latitude_data = None
        if parent_context:
            latitude_data = get_latitude_context(parent_context)
        if not latitude_data:
            from opentelemetry import context as otel_context

            latitude_data = get_latitude_context(otel_context.get_current())

        if latitude_data:
            if latitude_data.name:
                span.set_attribute(ATTRIBUTES.name, latitude_data.name)
                # Only update span name for the capture root span (has latitude.capture.root attr)
                # Child spans keep their original names (database.query, business.validate, etc.)
                if span.attributes and span.attributes.get("latitude.capture.root"):
                    span.update_name(latitude_data.name)
            if latitude_data.tags:
                span.set_attribute(ATTRIBUTES.tags, json.dumps(latitude_data.tags))
            if latitude_data.metadata:
                span.set_attribute(ATTRIBUTES.metadata, json.dumps(latitude_data.metadata))
            if latitude_data.session_id:
                span.set_attribute(ATTRIBUTES.session_id, latitude_data.session_id)
            if latitude_data.user_id:
                span.set_attribute(ATTRIBUTES.user_id, latitude_data.user_id)

        self._tail.on_start(span, parent_context)

    def on_end(self, span: ReadableSpan) -> None:
        self._tail.on_end(span)

    def shutdown(self) -> None:
        self._tail.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._tail.force_flush(timeout_millis)
