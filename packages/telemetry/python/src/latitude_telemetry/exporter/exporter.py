import time
from typing import Any, Dict, List, Sequence

import httpx
from opentelemetry.sdk import trace as otel
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.trace import format_span_id, format_trace_id

from latitude_telemetry.exporter.payloads import (
    Attribute,
    AttributeValue,
    CreateTraceRequestBody,
    Event,
    Link,
    Resource,
    ResourceSpan,
    ScopeSpan,
    Span,
    Status,
)
from latitude_telemetry.telemetry.types import GatewayOptions
from latitude_telemetry.util import Model

RETRIABLE_STATUSES = [408, 409, 429, 500, 502, 503, 504]


class ExporterOptions(Model):
    api_key: str
    gateway: GatewayOptions
    retries: int
    delay: float
    timeout: float


class Exporter(SpanExporter):
    _options: ExporterOptions

    def __init__(self, options: ExporterOptions):
        self._options = options

    def export(self, spans: Sequence[otel.ReadableSpan]) -> SpanExportResult:
        if not spans:
            return SpanExportResult.SUCCESS

        try:
            self._send(self._serialize(list(spans)))

        except Exception:
            return SpanExportResult.FAILURE

        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True

    def _serialize(self, spans: List[otel.ReadableSpan]) -> List[ResourceSpan]:
        if not spans:
            return []

        return [
            ResourceSpan(
                resource=Resource(attributes=self._serialize_attributes(dict(spans[0].resource.attributes or {}))),
                scope_spans=[
                    ScopeSpan(
                        spans=[
                            Span(
                                # Note: span.context should not be None
                                trace_id=format_trace_id(span.context.trace_id if span.context else 0),
                                # Note: span.context should not be None
                                span_id=format_span_id(span.context.span_id if span.context else 0),
                                parent_span_id=format_span_id(span.parent.span_id) if span.parent else None,
                                name=span.name,
                                kind=span.kind.value,
                                # Note: span.start_time should not be None
                                start_time=str(span.start_time or 0),
                                end_time=str(span.end_time) if span.end_time else None,
                                status=Status(
                                    code=span.status.status_code.value,
                                    message=span.status.description,
                                ),
                                events=[
                                    Event(
                                        name=event.name,
                                        time=str(event.timestamp),
                                        attributes=self._serialize_attributes(dict(event.attributes or {})),
                                    )
                                    for event in span.events
                                ],
                                links=[
                                    Link(
                                        trace_id=format_trace_id(link.context.trace_id),
                                        span_id=format_span_id(link.context.span_id),
                                        attributes=self._serialize_attributes(dict(link.attributes or {})),
                                    )
                                    for link in span.links
                                ],
                                attributes=self._serialize_attributes(dict(span.attributes or {})),
                            )
                            for span in spans
                        ]
                    )
                ],
            )
        ]

    def _serialize_attributes(self, attributes: Dict[str, Any]) -> List[Attribute]:
        serialized_attributes: List[Attribute] = []

        for key, value in attributes.items():
            serialized_value = AttributeValue(string=str(value))

            if isinstance(value, str):
                serialized_value = AttributeValue(string=value)

            elif isinstance(value, bool):
                serialized_value = AttributeValue(boolean=value)

            elif isinstance(value, int):
                serialized_value = AttributeValue(integer=value)

            elif isinstance(value, float):
                serialized_value = AttributeValue(integer=int(value))

            serialized_attributes.append(Attribute(key=key, value=serialized_value))

        return serialized_attributes

    def _send(self, spans: List[ResourceSpan]) -> None:
        client = httpx.Client(
            headers={
                "Authorization": f"Bearer {self._options.api_key}",
                "Content-Type": "application/json",
            },
            timeout=self._options.timeout,
            follow_redirects=False,
            max_redirects=0,
        )
        response = None
        attempt = 1

        try:
            method = "POST"
            url = f"{self._options.gateway.base_url}/otlp/v1/traces"
            content = CreateTraceRequestBody(resource_spans=spans).model_dump_json()

            while attempt <= self._options.retries:
                try:
                    response = client.request(method=method, url=url, content=content)
                    response.raise_for_status()

                    break

                except Exception as exception:
                    if attempt >= self._options.retries:
                        raise exception

                    if response and response.status_code in RETRIABLE_STATUSES:
                        time.sleep(self._options.delay * (2 ** (attempt - 1)))
                    else:
                        raise exception

                finally:
                    if response:
                        response.close()

                    attempt += 1

        finally:
            client.close()
