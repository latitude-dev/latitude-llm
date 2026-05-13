"""
Type definitions for the Latitude Telemetry SDK.
"""

from typing import Callable, Literal, NotRequired, Required, TypedDict

from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter

from latitude_telemetry.telemetry.redact_span_processor import RedactSpanProcessorOptions

InstrumentationType = Literal[
    "openai",
    "openai-agents",
    "anthropic",
    "bedrock",
    "cohere",
    "langchain",
    "llamaindex",
    "togetherai",
    "vertexai",
    "aiplatform",
]


class SmartFilterOptions(TypedDict, total=False):
    disable_smart_filter: bool
    should_export_span: Callable[[ReadableSpan], bool]
    blocked_instrumentation_scopes: list[str]


class ContextOptions(TypedDict, total=False):
    name: str
    tags: list[str]
    metadata: dict[str, object]
    session_id: str
    user_id: str
    # Route the capture (and all child spans) to a specific Latitude project.
    # Overrides the ctor `project_slug` default for this capture only.
    project_slug: str


class LatitudeOptions(SmartFilterOptions, total=False):
    api_key: Required[str]
    # Optional default project slug. When omitted, every `capture()` MUST set its own
    # `project_slug` (or rely on a per-span / OTEL resource attribute). When set, the SDK
    # forwards it as the `X-Latitude-Project` header so spans without a per-span override
    # land in this project.
    project_slug: NotRequired[str]
    instrumentations: list[InstrumentationType]
    disable_redact: bool
    redact: RedactSpanProcessorOptions
    disable_batch: bool
    exporter: SpanExporter
    tracer_provider: TracerProvider
    service_name: str


class InitLatitudeOptions(LatitudeOptions, total=False):
    pass


class LatitudeSpanProcessorOptions(SmartFilterOptions, total=False):
    disable_redact: bool
    redact: RedactSpanProcessorOptions
    disable_batch: bool
    exporter: SpanExporter
    service_name: str
