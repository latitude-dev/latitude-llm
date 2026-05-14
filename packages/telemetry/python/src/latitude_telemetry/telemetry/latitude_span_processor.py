"""
Composite span processor that sends traces to Latitude.

Add this to an existing OTel TracerProvider to export spans to Latitude
without replacing your current telemetry setup.
"""

import json
import typing
from collections.abc import Callable
from dataclasses import dataclass

from opentelemetry.context import Context
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter, SpanExportResult

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


class _ResourceOverrideSpan:
    """
    Lightweight ReadableSpan-shaped wrapper that delegates everything to the underlying span
    except `resource`, which is replaced with a merged copy carrying the Latitude override.

    Used by `_ServiceNameResourceExporter` so we don't mutate the original span (which is shared
    with other span processors on the host TracerProvider).
    """

    def __init__(self, span: ReadableSpan, resource: Resource) -> None:
        self._span = span
        self._resource = resource

    @property
    def resource(self) -> Resource:
        return self._resource

    def __getattr__(self, name: str) -> typing.Any:
        return getattr(self._span, name)


class _ServiceNameResourceExporter(SpanExporter):
    """
    Wraps a SpanExporter and rewrites each exported span's resource to carry the configured
    `service.name`. `service.name` is a resource attribute per OTel semantic conventions, not a
    span attribute — exporting through this wrapper keeps Latitude spec-compliant even when
    piggy-backing on a host SDK's TracerProvider (whose resource we can't change).
    """

    def __init__(self, inner: SpanExporter, service_name: str) -> None:
        self._inner = inner
        self._overlay = Resource.create({SERVICE_NAME: service_name})

    def export(self, spans: typing.Sequence[ReadableSpan]) -> SpanExportResult:
        overridden = [
            typing.cast(ReadableSpan, _ResourceOverrideSpan(span, span.resource.merge(self._overlay))) for span in spans
        ]
        return self._inner.export(overridden)

    def shutdown(self) -> None:
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return self._inner.force_flush(timeout_millis)


@dataclass
class LatitudeSpanProcessorOptions:
    disable_redact: bool = False
    redact: RedactSpanProcessorOptions | None = None
    disable_batch: bool = False
    disable_smart_filter: bool = False
    should_export_span: Callable[[ReadableSpan], bool] | None = None
    blocked_instrumentation_scopes: tuple[str, ...] = ()
    exporter: SpanExporter | None = None
    service_name: str | None = None


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

        base_exporter = options.exporter or create_exporter(
            ExporterOptions(
                api_key=api_key,
                project_slug=project_slug,
                endpoint=env.EXPORTER_URL,
                timeout=30,
            )
        )

        raw_service_name = options.service_name.strip() if options.service_name else ""
        exporter = _ServiceNameResourceExporter(base_exporter, raw_service_name) if raw_service_name else base_exporter

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
