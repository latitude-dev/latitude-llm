"""
Bootstrap function for Latitude Telemetry SDK.
"""

import atexit
import signal
import sys
from typing import Callable, TypedDict

from opentelemetry import trace
from opentelemetry.baggage.propagation import W3CBaggagePropagator
from opentelemetry.propagate import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from latitude_telemetry.sdk.instrumentations import register_latitude_instrumentations
from latitude_telemetry.sdk.types import InstrumentationType, SmartFilterOptions
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessor, LatitudeSpanProcessorOptions

SERVICE_NAME_DEFAULT = "latitude-telemetry-python"


class _InitLatitudeResult(TypedDict):
    provider: TracerProvider
    flush: Callable[[], None]
    shutdown: Callable[[], None]


def init_latitude(
    api_key: str,
    project_slug: str,
    instrumentations: list[InstrumentationType] | None = None,
    disable_redact: bool = False,
    disable_batch: bool = False,
    **kwargs: SmartFilterOptions,
) -> _InitLatitudeResult:
    """
    Bootstrap a complete OpenTelemetry setup with Latitude.

    This is the recommended way to use Latitude Telemetry. It sets up:
    - OpenTelemetry context manager for async propagation
    - W3C trace context and baggage propagators
    - TracerProvider with LatitudeSpanProcessor
    - LLM auto-instrumentation for specified providers
    - Graceful shutdown handlers

    Args:
        api_key: Your Latitude API key
        project_slug: Your Latitude project slug
        instrumentations: List of instrumentation types to enable (e.g., ["openai", "anthropic"])
        disable_redact: Disable PII redaction (default: False)
        disable_batch: Disable batching, send spans immediately (default: False)
        **kwargs: Additional smart filter options (disable_smart_filter, should_export_span,
            blocked_instrumentation_scopes)

    Returns:
        Object with provider, flush(), and shutdown() methods

    Example:
        latitude = init_latitude(
            api_key="your-api-key",
            project_slug="your-project",
            instrumentations=["openai", "anthropic"],
        )

        # Your LLM calls are now traced
        response = await openai.chat.completions.create(...)

        await latitude.shutdown()
    """
    if not api_key or not api_key.strip():
        raise ValueError("[Latitude] api_key is required and cannot be empty")
    if not project_slug or not project_slug.strip():
        raise ValueError("[Latitude] project_slug is required and cannot be empty")

    # Set up global propagator
    set_global_textmap(CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()]))

    provider = TracerProvider(
        resource=Resource.create({SERVICE_NAME: SERVICE_NAME_DEFAULT}),
    )

    processor = LatitudeSpanProcessor(
        api_key=api_key,
        project_slug=project_slug,
        options=LatitudeSpanProcessorOptions(
            disable_batch=disable_batch,
            disable_redact=disable_redact,
            disable_smart_filter=kwargs.get("disable_smart_filter", False),  # type: ignore[arg-type]
            should_export_span=kwargs.get("should_export_span"),  # type: ignore[arg-type]
            blocked_instrumentation_scopes=tuple(kwargs.get("blocked_instrumentation_scopes", [])),  # type: ignore[arg-type]
        ),
    )

    provider.add_span_processor(processor)

    # Set as global tracer provider so capture() can use it
    trace.set_tracer_provider(provider)

    if instrumentations:
        register_latitude_instrumentations(
            instrumentations=instrumentations,
            tracer_provider=provider,
        )

    def flush() -> None:
        provider.force_flush()

    def shutdown() -> None:
        provider.shutdown()

    atexit.register(shutdown)

    # Register SIGTERM handler for graceful shutdown in containers/Kubernetes
    # atexit handlers don't fire on SIGTERM, so we need explicit signal handling
    # Handler must call sys.exit(0) because Python signal handlers replace the
    # default termination behavior - without exit, the process would continue running
    def _handle_sigterm(_signum: int, _frame: object) -> None:
        shutdown()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_sigterm)

    return {
        "provider": provider,
        "flush": flush,
        "shutdown": shutdown,
    }
