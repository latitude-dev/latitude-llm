import json
import time
from typing import Any, Dict, List, Sequence

import httpx
from openinference.semconv import trace as oinfsem
from opentelemetry import semconv_ai as otelsem
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
                                # NOTE: span.context should not be None
                                trace_id=format_trace_id(span.context.trace_id if span.context else 0),
                                # NOTE: span.context should not be None
                                span_id=format_span_id(span.context.span_id if span.context else 0),
                                parent_span_id=format_span_id(span.parent.span_id) if span.parent else None,
                                name=span.name,
                                kind=span.kind.value,
                                # NOTE: span.start_time should not be None
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

        attributes = self._enrich_semantics(attributes)

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

            elif isinstance(value, dict):
                serialized_value = AttributeValue(string=json.dumps(value))

            serialized_attributes.append(Attribute(key=key, value=serialized_value))

        return serialized_attributes

    def _enrich_semantics(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        otel_attributes: Dict[str, Any] = {}

        if oinfsem.SpanAttributes.LLM_SYSTEM in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_SYSTEM] = attributes[oinfsem.SpanAttributes.LLM_SYSTEM]

        if (
            oinfsem.SpanAttributes.LLM_PROVIDER in attributes
            and otelsem.SpanAttributes.LLM_SYSTEM not in otel_attributes
        ):
            otel_attributes[otelsem.SpanAttributes.LLM_SYSTEM] = attributes[oinfsem.SpanAttributes.LLM_PROVIDER]

        if oinfsem.SpanAttributes.LLM_MODEL_NAME in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_MODEL] = attributes[
                oinfsem.SpanAttributes.LLM_MODEL_NAME
            ]
            otel_attributes[otelsem.SpanAttributes.LLM_RESPONSE_MODEL] = attributes[
                oinfsem.SpanAttributes.LLM_MODEL_NAME
            ]

        if otelsem.SpanAttributes.LLM_REQUEST_TYPE not in attributes and (
            otelsem.SpanAttributes.LLM_REQUEST_MODEL in attributes
            or oinfsem.SpanAttributes.LLM_MODEL_NAME in attributes
        ):
            otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TYPE] = otelsem.LLMRequestTypeValues.COMPLETION.value

        if oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS in attributes:
            if "max_tokens" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_MAX_TOKENS] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["max_tokens"]

            if "temperature" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TEMPERATURE] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["temperature"]

            if "top_p" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TOP_P] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["top_p"]

            if "top_k" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_TOP_K] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["top_k"]

            if "frequency_penalty" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_FREQUENCY_PENALTY] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["frequency_penalty"]

            if "presence_penalty" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_PRESENCE_PENALTY] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["presence_penalty"]

            if "stop_sequences" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_CHAT_STOP_SEQUENCES] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["stop_sequences"]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_PROMPT in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_PROMPT_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_PROMPT
            ]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_COMPLETION in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_COMPLETION_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_COMPLETION
            ]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_TOTAL in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_TOTAL
            ]

        for message in filter(
            lambda key: key.startswith(oinfsem.SpanAttributes.LLM_INPUT_MESSAGES),
            attributes.keys(),
        ):
            parts = message.split(".")
            index = parts[2]
            fields = ".".join(parts[4:])
            otel_attributes[f"{otelsem.SpanAttributes.LLM_PROMPTS}.{index}.{fields}"] = attributes[message]

        for message in filter(
            lambda key: key.startswith(oinfsem.SpanAttributes.LLM_OUTPUT_MESSAGES),
            attributes.keys(),
        ):
            parts = message.split(".")
            index = parts[2]
            fields = ".".join(parts[4:])
            otel_attributes[f"{otelsem.SpanAttributes.LLM_COMPLETIONS}.{index}.{fields}"] = attributes[message]

        return {**attributes, **otel_attributes}

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
