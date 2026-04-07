"""
Latitude Telemetry SDK for Python.

Instruments AI provider calls and forwards traces to Latitude.
Built on OpenTelemetry.

Example (Bootstrap - Recommended):
    from latitude_telemetry import init_latitude, capture

    latitude = init_latitude(
        api_key="your-api-key",
        project_slug="my-project",
        instrumentations=["openai", "anthropic"],
    )

    @capture("agent-run", {"tags": ["prod"], "user_id": "user_123"})
    def my_agent():
        # Your LLM calls are now traced
        response = client.chat.completions.create(...)
        return response

    # Or with the functional pattern:
    result = capture("agent-run", lambda: agent.process(input), {"tags": ["prod"]})

    await latitude.shutdown()

Example (Advanced - Existing OTel Setup):
    from opentelemetry.sdk.trace import TracerProvider
    from latitude_telemetry import LatitudeSpanProcessor, register_latitude_instrumentations

    provider = TracerProvider()
    provider.add_span_processor(LatitudeSpanProcessor("api-key", "project-slug"))
    provider.register()

    register_latitude_instrumentations(["openai"], provider)
"""

from latitude_telemetry.constants import ATTRIBUTES
from latitude_telemetry.sdk import (
    ContextOptions,
    InitLatitudeOptions,
    InstrumentationType,
    LatitudeSpanProcessorOptions,
    SmartFilterOptions,
    capture,
    get_latitude_context,
    init_latitude,
    register_latitude_instrumentations,
)
from latitude_telemetry.telemetry.latitude_span_processor import (
    LatitudeSpanProcessor,
)
from latitude_telemetry.telemetry.redact_span_processor import (
    RedactSpanProcessor,
    RedactSpanProcessorOptions,
    default_redact_span_processor,
)
from latitude_telemetry.telemetry.span_filter import (
    ExportFilterSpanProcessor,
    RedactThenExportSpanProcessor,
    build_should_export_span,
    is_default_export_span,
    is_gen_ai_or_llm_attribute_span,
    is_latitude_instrumentation_span,
)

__all__ = [
    # New SDK API (OpenTelemetry-first)
    "init_latitude",
    "capture",
    "register_latitude_instrumentations",
    "get_latitude_context",
    # Types
    "ContextOptions",
    "InitLatitudeOptions",
    "InstrumentationType",
    "LatitudeSpanProcessorOptions",
    "SmartFilterOptions",
    # Span Processor (composable mode)
    "LatitudeSpanProcessor",
    # Span filtering
    "build_should_export_span",
    "is_default_export_span",
    "is_gen_ai_or_llm_attribute_span",
    "is_latitude_instrumentation_span",
    "ExportFilterSpanProcessor",
    "RedactThenExportSpanProcessor",
    # Redaction
    "RedactSpanProcessor",
    "RedactSpanProcessorOptions",
    "default_redact_span_processor",
    # Constants
    "ATTRIBUTES",
]
