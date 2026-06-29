import functools
import inspect
from contextvars import Token
from typing import Any, Callable, Coroutine, TypeVar, overload

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.context import Context
from opentelemetry.trace import Span, Status, StatusCode

from latitude_telemetry.sdk._deprecation import warn_project_slug_deprecated
from latitude_telemetry.sdk.types import ContextOptions

LATITUDE_CONTEXT_KEY = "latitude-internal-context"
LATITUDE_CAPTURE_SCOPE_KEY = "latitude-internal-capture-scope"
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
        user_email: str | None = None,
        project: str | None = None,
    ):
        self.name = name
        self.tags = tags
        self.metadata = metadata
        self.session_id = session_id
        self.user_id = user_id
        self.user_email = user_email
        self.project = project


class CaptureScope:
    def __init__(
        self,
        token: Token[Context] | None,
        span: Span | None,
        context: Context | None = None,
    ):
        self._token = token
        self._span = span
        self._context = context
        self._ended = False

    def end(self, error: BaseException | None = None) -> None:
        _end_capture_scope(self, error)


def get_latitude_context(ctx: Context) -> _LatitudeContextData | None:
    data = ctx.get(LATITUDE_CONTEXT_KEY, None)
    if data is None:
        return None
    return data if isinstance(data, _LatitudeContextData) else None


def _should_reuse_active_latitude_trace(current_context: Context) -> bool:
    return get_latitude_context(current_context) is not None


def _set_capture_context(name: str, base_context: Context, options: ContextOptions | None = None) -> Context:
    opts = options or {}
    existing_data = get_latitude_context(base_context)

    parent_metadata = (existing_data.metadata if existing_data else None) or {}
    child_metadata = opts.get("metadata") or {}
    merged_metadata: dict[str, object] = {**parent_metadata, **child_metadata}

    if "project" not in opts and "project_slug" in opts:
        warn_project_slug_deprecated("capture")
    project_from_opts = opts.get("project") or opts.get("project_slug")

    merged_data = _LatitudeContextData(
        name=opts.get("name") or name,
        tags=_merge_arrays(existing_data.tags if existing_data else None, opts.get("tags")),
        metadata=merged_metadata,
        session_id=opts.get("session_id") or (existing_data.session_id if existing_data else None),
        user_id=opts.get("user_id") or (existing_data.user_id if existing_data else None),
        user_email=opts.get("user_email") or (existing_data.user_email if existing_data else None),
        project=project_from_opts or (existing_data.project if existing_data else None),
    )

    return otel_context.set_value(LATITUDE_CONTEXT_KEY, merged_data, base_context)


def _start_capture_scope(name: str, options: ContextOptions | None = None) -> CaptureScope:
    current_context = otel_context.get_current()
    should_reuse_trace = _should_reuse_active_latitude_trace(current_context)
    base_context = (
        current_context if should_reuse_trace else trace.set_span_in_context(trace.INVALID_SPAN, current_context)
    )
    new_context = _set_capture_context(name, base_context, options)
    existing_span = trace.get_current_span(current_context)
    span: Span | None = None

    if existing_span and existing_span.is_recording() and should_reuse_trace:
        scope = CaptureScope(None, None)
        scope_context = otel_context.set_value(LATITUDE_CAPTURE_SCOPE_KEY, scope, new_context)
        token = otel_context.attach(scope_context)
        scope._token = token
        scope._context = scope_context
        return scope

    tracer = trace.get_tracer(CAPTURE_TRACER_NAME)
    span = tracer.start_span(
        name,
        context=new_context,
        attributes={"latitude.capture.root": True},
    )
    new_context = trace.set_span_in_context(span, new_context)
    scope = CaptureScope(None, span)
    scope_context = otel_context.set_value(LATITUDE_CAPTURE_SCOPE_KEY, scope, new_context)
    token = otel_context.attach(scope_context)
    scope._token = token
    scope._context = scope_context
    return scope


def _get_active_capture_scope() -> CaptureScope | None:
    scope = otel_context.get_current().get(LATITUDE_CAPTURE_SCOPE_KEY, None)
    return scope if isinstance(scope, CaptureScope) else None


def _end_capture_scope(
    scope_or_error: CaptureScope | BaseException | None = None, error: BaseException | None = None
) -> None:
    if isinstance(scope_or_error, CaptureScope):
        scope = scope_or_error
        captured_error = error
    else:
        scope = _get_active_capture_scope()
        captured_error = scope_or_error

    if scope is None or scope._ended:
        return

    if captured_error is not None and scope._span is not None:
        scope._span.record_exception(captured_error)
        scope._span.set_status(Status(StatusCode.ERROR, str(captured_error)))

    if scope._span is not None:
        scope._span.end()
    scope._ended = True
    if scope._token is not None:
        otel_context.detach(scope._token)
        scope._token = None


def _detach_capture_scope(scope: CaptureScope) -> None:
    if scope._token is not None:
        otel_context.detach(scope._token)
        scope._token = None


def _attach_capture_scope(scope: CaptureScope) -> None:
    if scope._context is not None and scope._token is None:
        scope._token = otel_context.attach(scope._context)


def _execute_with_context(name: str, fn: Callable[[], T], options: ContextOptions | None = None) -> T:
    if inspect.iscoroutinefunction(fn):

        async def async_wrapper() -> T:
            scope = _start_capture_scope(name, options)
            try:
                return await fn()
            except Exception as e:
                _end_capture_scope(scope, e)
                raise
            finally:
                _end_capture_scope(scope)

        return async_wrapper()  # type: ignore[return-value]

    scope = _start_capture_scope(name, options)
    try:
        result = fn()
    except Exception as e:
        _end_capture_scope(scope, e)
        raise

    if inspect.isawaitable(result):
        _detach_capture_scope(scope)

        async def await_result() -> T:
            _attach_capture_scope(scope)
            try:
                return await result
            except Exception as e:
                _end_capture_scope(scope, e)
                raise
            finally:
                _end_capture_scope(scope)

        return await_result()  # type: ignore[return-value]

    _end_capture_scope(scope)
    return result


class _CaptureAPI:
    @overload
    def __call__(
        self,
        name: str,
        fn_or_options: ContextOptions | None = None,
    ) -> Callable[[F], F]: ...

    @overload
    def __call__(
        self,
        name: str,
        fn_or_options: Callable[[], T],
        options: ContextOptions | None = None,
    ) -> T: ...

    def __call__(
        self,
        name: str,
        fn_or_options: Callable[[], object] | ContextOptions | None = None,
        options: ContextOptions | None = None,
    ) -> object:
        if fn_or_options is None:
            return _create_decorator(name, None)

        if callable(fn_or_options):
            return _execute_with_context(name, fn_or_options, options)

        opts = fn_or_options if isinstance(fn_or_options, dict) else None
        return _create_decorator(name, opts)

    def start(self, name: str, options: ContextOptions | None = None) -> CaptureScope:
        return _start_capture_scope(name, options)

    def end(self, scope: CaptureScope | BaseException | None = None, error: BaseException | None = None) -> None:
        _end_capture_scope(scope, error)


capture = _CaptureAPI()


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
    scope = _start_capture_scope(name, options)
    try:
        return await fn(*args, **kwargs)
    except Exception as e:
        _end_capture_scope(scope, e)
        raise
    finally:
        _end_capture_scope(scope)


def _execute_with_context_sync(
    name: str,
    fn: Callable[..., object],
    args: tuple[object, ...],
    kwargs: dict[str, object],
    options: ContextOptions | None,
) -> object:
    scope = _start_capture_scope(name, options)
    try:
        return fn(*args, **kwargs)
    except Exception as e:
        _end_capture_scope(scope, e)
        raise
    finally:
        _end_capture_scope(scope)
