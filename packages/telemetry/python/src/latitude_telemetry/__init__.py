"""
Latitude Telemetry SDK for Python.

This package provides telemetry and tracing capabilities for AI applications
built with Latitude. It supports automatic instrumentation of various AI
providers and frameworks, as well as manual span creation.

Example:
    from latitude_telemetry import Telemetry, Instrumentors

    # Initialize with automatic instrumentation
    telemetry = Telemetry(
        api_key="your-api-key",
        options=TelemetryOptions(
            instrumentors=[Instrumentors.OpenAI, Instrumentors.Anthropic]
        )
    )

    # Your OpenAI/Anthropic calls will be automatically traced
"""

import warnings

# Suppress Pydantic V2 deprecation warnings from OpenTelemetry instrumentation dependencies
warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")

# Main SDK
from latitude_telemetry.telemetry import (
    Telemetry,
    TelemetryOptions,
    InternalOptions,
    BadRequestError,
    CaptureContext,
)

# Types
from latitude_telemetry.telemetry.types import (
    Instrumentors,
    GatewayOptions,
    SpanPrompt,
    SpanMetadata,
    TelemetryAttributes,
)

# Constants
from latitude_telemetry.constants import (
    ATTRIBUTES,
    VALUES,
    SpanType,
    SpanKind,
    SpanStatus,
    SPAN_SPECIFICATIONS,
    LogSources,
    SCOPE_LATITUDE,
    InstrumentationScope,
    HEAD_COMMIT,
    DOCUMENT_PATH_REGEXP,
)

# Instrumentations
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    ManualInstrumentation,
    TraceContext,
    StartSpanOptions,
    EndSpanOptions,
    ErrorOptions,
    StartToolSpanOptions,
    EndToolSpanOptions,
    StartCompletionSpanOptions,
    EndCompletionSpanOptions,
    StartHttpSpanOptions,
    EndHttpSpanOptions,
    PromptSpanOptions,
    ChatSpanOptions,
    ExternalSpanOptions,
    CaptureOptions,
    SpanHandle,
    ToolSpanHandle,
    CompletionSpanHandle,
    HttpSpanHandle,
    ToolCallInfo,
    ToolResultInfo,
    TokenUsage,
    HttpRequest,
    HttpResponse,
)

# Managers
from latitude_telemetry.managers import (
    SpanFactory,
    ContextManager,
    InstrumentationManager,
    TracerManager,
    ScopedTracerProvider,
    get_current_context,
)

# Exporter
from latitude_telemetry.exporter import create_exporter, ExporterOptions

__all__ = [
    # Main SDK
    "Telemetry",
    "TelemetryOptions",
    "InternalOptions",
    "BadRequestError",
    "CaptureContext",
    # Types
    "Instrumentors",
    "GatewayOptions",
    "SpanPrompt",
    "SpanMetadata",
    "TelemetryAttributes",
    # Constants
    "ATTRIBUTES",
    "VALUES",
    "SpanType",
    "SpanKind",
    "SpanStatus",
    "SPAN_SPECIFICATIONS",
    "LogSources",
    "SCOPE_LATITUDE",
    "InstrumentationScope",
    "HEAD_COMMIT",
    "DOCUMENT_PATH_REGEXP",
    # Instrumentations
    "BaseInstrumentation",
    "ManualInstrumentation",
    "TraceContext",
    "StartSpanOptions",
    "EndSpanOptions",
    "ErrorOptions",
    "StartToolSpanOptions",
    "EndToolSpanOptions",
    "StartCompletionSpanOptions",
    "EndCompletionSpanOptions",
    "StartHttpSpanOptions",
    "EndHttpSpanOptions",
    "PromptSpanOptions",
    "ChatSpanOptions",
    "ExternalSpanOptions",
    "CaptureOptions",
    "SpanHandle",
    "ToolSpanHandle",
    "CompletionSpanHandle",
    "HttpSpanHandle",
    "ToolCallInfo",
    "ToolResultInfo",
    "TokenUsage",
    "HttpRequest",
    "HttpResponse",
    # Managers
    "SpanFactory",
    "ContextManager",
    "InstrumentationManager",
    "TracerManager",
    "ScopedTracerProvider",
    "get_current_context",
    # Exporter
    "create_exporter",
    "ExporterOptions",
]
