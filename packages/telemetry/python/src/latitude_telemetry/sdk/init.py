"""
Bootstrap class and compatibility function for Latitude Telemetry SDK.
"""

import atexit
import logging
import signal
import sys
from typing import Callable, TypedDict, cast

from opentelemetry import trace
from opentelemetry.baggage.propagation import W3CBaggagePropagator
from opentelemetry.propagate import set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter
from opentelemetry.trace import NoOpTracerProvider, ProxyTracerProvider
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from latitude_telemetry.sdk.instrumentations import register_latitude_instrumentations
from latitude_telemetry.sdk.types import InstrumentationType, SmartFilterOptions
from latitude_telemetry.telemetry.latitude_span_processor import LatitudeSpanProcessor, LatitudeSpanProcessorOptions
from latitude_telemetry.telemetry.redact_span_processor import RedactSpanProcessorOptions

logger = logging.getLogger(__name__)

SERVICE_NAME_DEFAULT = "latitude-telemetry-python"

_shutdown_handlers_registered = False


class _InitLatitudeResult(TypedDict):
    provider: TracerProvider
    flush: Callable[[], None]
    shutdown: Callable[[], None]


def _get_registered_tracer_provider() -> TracerProvider | None:
    # `trace.get_tracer_provider()` returns the singleton ProxyTracerProvider when nothing has been
    # explicitly registered, and the real provider once `trace.set_tracer_provider()` has been called.
    # Using the public API instead of the module-private `_TRACER_PROVIDER` makes this resilient to
    # OTel internal refactors.
    provider = trace.get_tracer_provider()
    if isinstance(provider, (ProxyTracerProvider, NoOpTracerProvider)):
        return None

    return cast(TracerProvider, provider)


def _attach_span_processor(provider: object, processor: LatitudeSpanProcessor) -> bool:
    add = getattr(provider, "add_span_processor", None)
    if callable(add):
        add(processor)
        return True

    return False


class Latitude:
    """
    Bootstrap Latitude telemetry with an OpenTelemetry-first API.

    The class mirrors the TypeScript SDK: it detects an existing OpenTelemetry
    tracer provider or creates one when none exists, attaches the Latitude span
    processor, registers requested LLM instrumentations, and exposes `provider`,
    `flush()`, and `shutdown()`.
    """

    provider: TracerProvider

    def __init__(
        self,
        *,
        api_key: str,
        project_slug: str,
        instrumentations: list[InstrumentationType] | None = None,
        disable_redact: bool = False,
        redact: RedactSpanProcessorOptions | None = None,
        disable_batch: bool = False,
        disable_smart_filter: bool = False,
        should_export_span: Callable[[ReadableSpan], bool] | None = None,
        blocked_instrumentation_scopes: list[str] | None = None,
        exporter: SpanExporter | None = None,
        tracer_provider: TracerProvider | None = None,
        service_name: str | None = None,
    ):
        if not api_key or not api_key.strip():
            raise ValueError("[Latitude] api_key is required and cannot be empty")
        if not project_slug or not project_slug.strip():
            raise ValueError("[Latitude] project_slug is required and cannot be empty")

        target_provider = tracer_provider or _get_registered_tracer_provider()

        # `service_name` is a Latitude-owned-provider concern. When piggy-backing on an existing
        # provider, the host's resource is the source of truth for `service.name` — overriding it
        # would silently relabel spans the host SDK also processes. So we only pass `service_name`
        # to the processor when Latitude will create + own its own provider.
        processor_service_name = service_name if target_provider is None else None

        self._latitude_processor = LatitudeSpanProcessor(
            api_key=api_key,
            project_slug=project_slug,
            options=LatitudeSpanProcessorOptions(
                disable_batch=disable_batch,
                disable_redact=disable_redact,
                redact=redact,
                disable_smart_filter=disable_smart_filter,
                should_export_span=should_export_span,
                blocked_instrumentation_scopes=tuple(blocked_instrumentation_scopes or []),
                exporter=exporter,
                service_name=processor_service_name,
            ),
        )

        attached = _attach_span_processor(target_provider, self._latitude_processor) if target_provider else False

        if target_provider is not None and not attached:
            source = (
                "the provider passed via `tracer_provider`"
                if tracer_provider is not None
                else "the global OpenTelemetry provider"
            )
            logger.warning(
                "[Latitude] Could not attach LatitudeSpanProcessor to %s: it does not expose "
                "`add_span_processor`. Falling back to a Latitude-owned provider that is NOT "
                "registered globally — instrumentations will still send spans to Latitude, but "
                "the host SDK's spans will not. To fix, pass a provider exposing "
                "`add_span_processor` (e.g. `opentelemetry.sdk.trace.TracerProvider`).",
                source,
            )

        if target_provider is not None and attached:
            self.provider = target_provider
            self._owns_provider = False
        else:
            raw_service_name = service_name.strip() if service_name else ""
            resource_service_name = raw_service_name or SERVICE_NAME_DEFAULT

            if target_provider is None:
                set_global_textmap(CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()]))

            provider = TracerProvider(
                resource=Resource.create({SERVICE_NAME: resource_service_name}),
            )
            provider.add_span_processor(self._latitude_processor)
            if target_provider is None:
                trace.set_tracer_provider(provider)

            self.provider = provider
            self._owns_provider = True

        if instrumentations:
            register_latitude_instrumentations(
                instrumentations=instrumentations,
                tracer_provider=self.provider,
            )

        self._register_shutdown_handlers()

    def flush(self) -> None:
        if self._owns_provider:
            self.provider.force_flush()
            return

        self._latitude_processor.force_flush()

    def shutdown(self) -> None:
        if self._owns_provider:
            self.provider.shutdown()
            return

        self._latitude_processor.shutdown()

    def _register_shutdown_handlers(self) -> None:
        global _shutdown_handlers_registered

        if _shutdown_handlers_registered:
            return

        atexit.register(self.shutdown)

        def _handle_signal(_signum: int, _frame: object) -> None:
            try:
                self.shutdown()
            except Exception:
                logger.exception("Error during Latitude Telemetry shutdown")
            sys.exit(0)

        signal.signal(signal.SIGTERM, _handle_signal)
        signal.signal(signal.SIGINT, _handle_signal)
        _shutdown_handlers_registered = True


def init_latitude(
    api_key: str,
    project_slug: str,
    instrumentations: list[InstrumentationType] | None = None,
    disable_redact: bool = False,
    redact: RedactSpanProcessorOptions | None = None,
    disable_batch: bool = False,
    exporter: SpanExporter | None = None,
    tracer_provider: TracerProvider | None = None,
    service_name: str | None = None,
    **kwargs: SmartFilterOptions,
) -> _InitLatitudeResult:
    """
    Compatibility wrapper around `Latitude`.

    Prefer `Latitude(...)` for new code. This function keeps the existing dict
    return shape for applications already using `init_latitude()`.
    """
    should_export_span = cast(Callable[[ReadableSpan], bool] | None, kwargs.get("should_export_span"))
    blocked_instrumentation_scopes = cast(list[str] | None, kwargs.get("blocked_instrumentation_scopes"))

    latitude = Latitude(
        api_key=api_key,
        project_slug=project_slug,
        instrumentations=instrumentations,
        disable_batch=disable_batch,
        disable_redact=disable_redact,
        redact=redact,
        exporter=exporter,
        tracer_provider=tracer_provider,
        service_name=service_name,
        disable_smart_filter=kwargs.get("disable_smart_filter", False),  # type: ignore[arg-type]
        should_export_span=should_export_span,
        blocked_instrumentation_scopes=blocked_instrumentation_scopes,
    )

    return {
        "provider": latitude.provider,
        "flush": latitude.flush,
        "shutdown": latitude.shutdown,
    }
