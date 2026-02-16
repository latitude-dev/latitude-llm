"""
Manager classes for Latitude telemetry.
"""

from typing import Dict, List

from opentelemetry import baggage, context as otel_context
from opentelemetry.context import Context
from opentelemetry.sdk.trace import TracerProvider

from latitude_telemetry.constants import SCOPE_LATITUDE
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    ChatSpanOptions,
    CompletionSpanHandle,
    ExternalSpanOptions,
    HttpSpanHandle,
    ManualInstrumentation,
    PromptSpanOptions,
    SpanHandle,
    StartCompletionSpanOptions,
    StartHttpSpanOptions,
    StartSpanOptions,
    StartToolSpanOptions,
    ToolSpanHandle,
    TraceContext,
)


def get_current_context() -> Context:
    """Get the current OpenTelemetry context."""
    return otel_context.get_current()


class SpanFactory:
    """
    Factory for creating telemetry spans.
    Provides convenient methods for different span types.
    """

    def __init__(self, manual_instrumentation: ManualInstrumentation):
        self._manual = manual_instrumentation

    def tool(self, options: StartToolSpanOptions, ctx: Context | None = None) -> ToolSpanHandle:
        """Create a tool execution span."""
        return self._manual.tool(ctx or get_current_context(), options)

    def completion(self, options: StartCompletionSpanOptions, ctx: Context | None = None) -> CompletionSpanHandle:
        """Create a completion span."""
        return self._manual.completion(ctx or get_current_context(), options)

    def embedding(self, options: StartSpanOptions | None = None, ctx: Context | None = None) -> SpanHandle:
        """Create an embedding span."""
        return self._manual.embedding(ctx or get_current_context(), options)

    def http(self, options: StartHttpSpanOptions, ctx: Context | None = None) -> HttpSpanHandle:
        """Create an HTTP request span."""
        return self._manual.http(ctx or get_current_context(), options)

    def prompt(self, options: PromptSpanOptions, ctx: Context | None = None) -> SpanHandle:
        """Create a prompt span."""
        return self._manual.prompt(ctx or get_current_context(), options)

    def chat(self, options: ChatSpanOptions, ctx: Context | None = None) -> SpanHandle:
        """Create a chat continuation span."""
        return self._manual.chat(ctx or get_current_context(), options)

    def external(self, options: ExternalSpanOptions, ctx: Context | None = None) -> SpanHandle:
        """Create an external span."""
        return self._manual.external(ctx or get_current_context(), options)


class ContextManager:
    """
    Manager for trace context operations.
    Handles resuming traces and accessing the current context.
    """

    def __init__(self, manual_instrumentation: ManualInstrumentation):
        self._manual = manual_instrumentation

    def resume(self, ctx: TraceContext) -> Context:
        """Resume a trace from a TraceContext (traceparent + baggage)."""
        return self._manual.resume(ctx)

    def active(self) -> Context:
        """Get the current active context."""
        return get_current_context()

    def set_attributes(self, ctx: Context, attributes: Dict[str, str]) -> Context:
        """
        Sets custom attributes in the OpenTelemetry baggage that will be
        automatically propagated to all child spans in the trace.

        This is useful for setting trace-level metadata that should be
        inherited by all spans without manually passing them to each span.

        Args:
            ctx: The context to set attributes in
            attributes: Dictionary of attribute key-value pairs

        Returns:
            A new context with the attributes set in baggage

        Example:
            ctx = telemetry.context.set_attributes(
                telemetry.context.active(),
                {
                    'latitude.document_log_uuid': 'uuid-123',
                    'latitude.document_uuid': 'prompt-456',
                    'latitude.commit_uuid': 'commit-789',
                    'latitude.project_id': '123',
                    'custom.attribute': 'value'
                }
            )

            # All spans created within this context will automatically
            # inherit the baggage attributes
            with telemetry.context.with_context(ctx):
                tool = telemetry.span.tool(StartToolSpanOptions(name='my-tool'))
                tool.end()
        """
        for key, value in attributes.items():
            ctx = baggage.set_baggage(key, value, ctx)

        return ctx


class InstrumentationManager:
    """
    Manager for controlling instrumentations.
    Allows enabling/disabling all registered instrumentations.
    """

    def __init__(self, instrumentations: List[BaseInstrumentation]):
        self._instrumentations = instrumentations

    def enable(self) -> None:
        """Enable all instrumentations."""
        for instrumentation in self._instrumentations:
            if not instrumentation.is_enabled():
                instrumentation.enable()

    def disable(self) -> None:
        """Disable all instrumentations."""
        for instrumentation in self._instrumentations:
            if instrumentation.is_enabled():
                instrumentation.disable()


class ScopedTracerProvider:
    """
    Wrapper around TracerProvider that provides scoped tracers.
    """

    def __init__(self, scope: str, version: str, provider: TracerProvider):
        self._scope = scope
        self._version = version
        self._provider = provider

    def get_tracer(self, name: str = ""):
        """Get a tracer with the configured scope."""
        return self._provider.get_tracer(self._scope, self._version)


class TracerManager:
    """
    Manager for creating and accessing tracers.
    """

    def __init__(self, provider: TracerProvider, scope_version: str):
        self._provider = provider
        self._scope_version = scope_version

    def get(self, scope: str):
        """Get a tracer for the given scope."""
        return self.provider(scope).get_tracer("")

    def provider(self, scope: str) -> ScopedTracerProvider:
        """Get a scoped tracer provider."""
        return ScopedTracerProvider(
            f"{SCOPE_LATITUDE}.{scope}",
            self._scope_version,
            self._provider,
        )


__all__ = [
    "SpanFactory",
    "ContextManager",
    "InstrumentationManager",
    "TracerManager",
    "ScopedTracerProvider",
    "get_current_context",
]
