"""
Context management and capture() implementation using OpenTelemetry's Context API.
"""

import functools
import inspect
from typing import Any, Callable, Coroutine, TypeVar, overload

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.context import Context

from latitude_telemetry.sdk.types import ContextOptions

LATITUDE_CONTEXT_KEY = "latitude-internal-context"
CAPTURE_TRACER_NAME = "so.latitude.instrumentation.capture"

T = TypeVar("T")
F = TypeVar("F", bound=Callable[..., object])


def _merge_arrays(a: list[str] | None, b: list[str] | None) -> list[str] | None:
    if not a and not b:
        return None
    if not a:
        return b
    if not b:
        return a
    seen: set[str] = set()
    result: list[str] = []
    for item in [*a, *b]:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


class _LatitudeContextData:
    def __init__(
        self,
        name: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, object] | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
    ):
        self.name = name
        self.tags = tags
        self.metadata = metadata
        self.session_id = session_id
        self.user_id = user_id


def get_latitude_context(ctx: Context) -> _LatitudeContextData | None:
    data = ctx.get(LATITUDE_CONTEXT_KEY, None)
    if data is None:
        return None
    return data if isinstance(data, _LatitudeContextData) else None


def _should_reuse_active_latitude_trace(current_context: Context) -> bool:
    return get_latitude_context(current_context) is not None


def _set_capture_context(name: str, base_context: Context, options: ContextOptions | None = None) -> Context:
    """Set up the capture context and return the new OTel context."""
    opts = options or {}
    existing_data = get_latitude_context(base_context)

    # Merge logic matching TypeScript SDK:
    # - name: options.name takes precedence over capture name
    # - tags: merge and deduplicate
    # - metadata: shallow merge (child overrides parent for same keys)
    # - session_id/user_id: last-write-wins (child overrides parent)
    parent_metadata = (existing_data.metadata if existing_data else None) or {}
    child_metadata = opts.get("metadata") or {}
    merged_metadata: dict[str, object] = {**parent_metadata, **child_metadata}

    merged_data = _LatitudeContextData(
        name=opts.get("name") or name,
        tags=_merge_arrays(existing_data.tags if existing_data else None, opts.get("tags")),
        metadata=merged_metadata,
        session_id=opts.get("session_id") or (existing_data.session_id if existing_data else None),
        user_id=opts.get("user_id") or (existing_data.user_id if existing_data else None),
    )

    return otel_context.set_value(LATITUDE_CONTEXT_KEY, merged_data, base_context)


def _execute_with_context(name: str, fn: Callable[[], T], options: ContextOptions | None = None) -> T:
    """Execute within capture context, reusing only Latitude-owned active traces."""
    current_context = otel_context.get_current()
    should_reuse_trace = _should_reuse_active_latitude_trace(current_context)
    base_context = (
        current_context if should_reuse_trace else trace.set_span_in_context(trace.INVALID_SPAN, current_context)
    )
    new_context = _set_capture_context(name, base_context, options)

    existing_span = trace.get_current_span(current_context)

    if existing_span and existing_span.is_recording() and should_reuse_trace:
        return _execute_with_existing_context(fn, new_context)

    return _execute_with_new_parent_span(name, fn, new_context)


def _execute_with_existing_context(fn: Callable[[], T], context: Context) -> T:
    """Execute function with existing context - no parent span creation."""
    # Check if fn is async
    if inspect.iscoroutinefunction(fn):

        async def async_wrapper() -> T:
            token = otel_context.attach(context)
            try:
                return await fn()
            finally:
                otel_context.detach(token)

        return async_wrapper()  # type: ignore[return-value]

    # Sync function
    token = otel_context.attach(context)
    try:
        return fn()
    finally:
        otel_context.detach(token)


def _execute_with_new_parent_span(name: str, fn: Callable[[], T], ctx: Context) -> T:
    """Execute function with a new parent span to establish trace continuity."""
    tracer = trace.get_tracer(CAPTURE_TRACER_NAME)

    # Check if fn is async
    if inspect.iscoroutinefunction(fn):

        async def async_wrapper() -> T:
            # Attach latitude context first, then create span
            token = otel_context.attach(ctx)
            try:
                with tracer.start_as_current_span(
                    name,
                    attributes={"latitude.capture.root": True},
                ) as span:
                    try:
                        return await fn()
                    except Exception as e:
                        span.record_exception(e)
                        raise
            finally:
                otel_context.detach(token)

        return async_wrapper()  # type: ignore[return-value]

    # Sync function
    token = otel_context.attach(ctx)
    try:
        with tracer.start_as_current_span(
            name,
            attributes={"latitude.capture.root": True},
        ) as span:
            try:
                return fn()
            except Exception as e:
                span.record_exception(e)
                raise
    finally:
        otel_context.detach(token)


# Overload 1: Used as decorator factory: @capture("name") or @capture("name", {...})
@overload
def capture(
    name: str,
    fn_or_options: ContextOptions | None = None,
) -> Callable[[F], F]: ...


# Overload 2: Used as direct wrapper: capture("name", lambda: ..., {...})
@overload
def capture(
    name: str,
    fn_or_options: Callable[[], T],
    options: ContextOptions | None = None,
) -> T: ...


def capture(
    name: str,
    fn_or_options: Callable[[], object] | ContextOptions | None = None,
    options: ContextOptions | None = None,
) -> object:
    """
    Capture context for Latitude telemetry. Can be used as a decorator or direct wrapper.

    As a decorator:
        @capture("agent-run", {"tags": ["prod"], "user_id": "user_123"})
        def my_agent():
            return agent.process(input)

        @capture("async-agent")  # minimal usage
        async def async_agent():
            return await agent.process(input)

    As a direct wrapper:
        result = capture("agent-run", lambda: agent.process(input), {"tags": ["prod"]})

    The context includes tags, metadata, session_id, and user_id which are
    stamped onto all spans via the LatitudeSpanProcessor.on_start() method.

    If no active Latitude trace exists, capture() creates a parent span to
    establish trace continuity. Nested Latitude capture() calls reuse the
    existing Latitude trace instead of creating another root span.

    Args:
        name: Name for the capture context (stored as latitude.capture.name attribute)
        fn_or_options: When used as decorator, this is the options dict.
                       When used as wrapper, this is the function to execute.
        options: Optional additional context (only used in wrapper mode)

    Returns:
        Decorated function (decorator mode) or result of fn() (wrapper mode)
    """
    # Determine if we're being called as a decorator factory or direct wrapper
    # In decorator mode: capture("name") or capture("name", {...})
    # In wrapper mode: capture("name", fn) or capture("name", fn, {...})

    if fn_or_options is None:
        # @capture("name") with no second arg - decorator mode
        return _create_decorator(name, None)

    if callable(fn_or_options):
        # capture("name", fn) or capture("name", fn, {...}) - wrapper mode
        fn = fn_or_options
        return _execute_with_context(name, fn, options)  # type: ignore[return-value]

    # fn_or_options is a dict - decorator mode with options
    # @capture("name", {"tags": [...]})
    opts = fn_or_options if isinstance(fn_or_options, dict) else None
    return _create_decorator(name, opts)


def _create_decorator(name: str, options: ContextOptions | None) -> Callable[[F], F]:
    """Create a decorator that wraps the function with capture context."""

    def decorator(fn: F) -> F:
        # Use function name if no explicit name provided
        capture_name = name or fn.__name__

        if inspect.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: object, **kwargs: object) -> object:
                # Cast fn to coroutine function type since iscoroutinefunction confirmed it
                coro_fn = fn  # type: ignore[assignment]
                return await _execute_with_context_async(capture_name, coro_fn, args, kwargs, options)

            return async_wrapper  # type: ignore[return-value]
        else:

            @functools.wraps(fn)
            def sync_wrapper(*args: object, **kwargs: object) -> object:
                return _execute_with_context_sync(capture_name, fn, args, kwargs, options)

            return sync_wrapper  # type: ignore[return-value]

    return decorator


async def _execute_with_context_async(
    name: str,
    fn: Callable[..., Coroutine[Any, Any, object]],
    args: tuple[object, ...],
    kwargs: dict[str, object],
    options: ContextOptions | None,
) -> object:
    """Execute async function with capture context."""
    current_context = otel_context.get_current()
    should_reuse_trace = _should_reuse_active_latitude_trace(current_context)
    base_context = (
        current_context if should_reuse_trace else trace.set_span_in_context(trace.INVALID_SPAN, current_context)
    )
    new_context = _set_capture_context(name, base_context, options)

    existing_span = trace.get_current_span(current_context)

    if existing_span and existing_span.is_recording() and should_reuse_trace:
        token = otel_context.attach(new_context)
        try:
            return await fn(*args, **kwargs)
        finally:
            otel_context.detach(token)

    tracer = trace.get_tracer(CAPTURE_TRACER_NAME)
    token = otel_context.attach(new_context)
    try:
        with tracer.start_as_current_span(
            name,
            attributes={"latitude.capture.root": True},
        ) as span:
            try:
                return await fn(*args, **kwargs)
            except Exception as e:
                span.record_exception(e)
                raise
    finally:
        otel_context.detach(token)


def _execute_with_context_sync(
    name: str,
    fn: Callable[..., object],
    args: tuple[object, ...],
    kwargs: dict[str, object],
    options: ContextOptions | None,
) -> object:
    """Execute sync function with capture context."""
    current_context = otel_context.get_current()
    should_reuse_trace = _should_reuse_active_latitude_trace(current_context)
    base_context = (
        current_context if should_reuse_trace else trace.set_span_in_context(trace.INVALID_SPAN, current_context)
    )
    new_context = _set_capture_context(name, base_context, options)

    existing_span = trace.get_current_span(current_context)

    if existing_span and existing_span.is_recording() and should_reuse_trace:
        token = otel_context.attach(new_context)
        try:
            return fn(*args, **kwargs)
        finally:
            otel_context.detach(token)

    tracer = trace.get_tracer(CAPTURE_TRACER_NAME)
    token = otel_context.attach(new_context)
    try:
        with tracer.start_as_current_span(
            name,
            attributes={"latitude.capture.root": True},
        ) as span:
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                span.record_exception(e)
                raise
    finally:
        otel_context.detach(token)
