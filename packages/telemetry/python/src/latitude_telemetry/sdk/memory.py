"""
First-party helper for emitting OpenTelemetry GenAI memory-operation spans.

Mirrors the TypeScript `createMemoryTelemetry`: each operation optionally wraps an
`execute` callable (capturing latency, errors, and status) or emits a completed span.
Record content (`gen_ai.memory.records`) is opt-in via `capture_content`.
"""

import inspect
import json
from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any, NotRequired, Required, TypedDict

from opentelemetry import context as otel_context
from opentelemetry import trace
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.util.types import AttributeValue

from latitude_telemetry.constants import MEMORY_ATTRIBUTES
from latitude_telemetry.sdk.tracer import latitude_attributes_from_context
from latitude_telemetry.sdk.types import ContextOptions

if TYPE_CHECKING:
    from latitude_telemetry.sdk.init import Latitude


class MemoryRecord(TypedDict, total=False):
    """A record per the OTEL `gen_ai.memory.records` schema; `content` is required."""

    content: Required[object]
    id: NotRequired[str]
    score: NotRequired[float]
    metadata: NotRequired[dict[str, object]]


class MemoryRedactInfo(TypedDict):
    operation: str
    store_id: str


RedactFn = Callable[[list[MemoryRecord], MemoryRedactInfo], list[MemoryRecord]]
ContextInput = ContextOptions | Callable[[], ContextOptions | None] | None


def _identity_redact(records: list[MemoryRecord], info: MemoryRedactInfo) -> list[MemoryRecord]:
    return records


def _stringify(value: object) -> str:
    try:
        return json.dumps(value)
    except (TypeError, ValueError):
        return str(value)


class MemoryTelemetry:
    def __init__(
        self,
        latitude: "Latitude",
        *,
        scope: str = "memory",
        store_id: str | None = None,
        context: ContextInput = None,
        capture_content: bool = False,
        redact: RedactFn | None = None,
    ):
        self._latitude = latitude
        self._scope = scope
        self._default_store_id = store_id
        self._context = context
        self._default_capture_content = capture_content
        self._redact: RedactFn = redact or _identity_redact

    def _resolve_context(self) -> ContextOptions | None:
        return self._context() if callable(self._context) else self._context

    def _build_attributes(
        self,
        operation: str,
        store_id: str,
        record_id: str | None,
        count: int | None,
        query: str | None,
        records: Sequence[MemoryRecord] | None,
        capture_content: bool,
        context: ContextOptions | None,
    ) -> dict[str, AttributeValue]:
        attributes: dict[str, AttributeValue] = dict(latitude_attributes_from_context(context or {}))
        attributes[MEMORY_ATTRIBUTES.operation_name] = operation
        attributes[MEMORY_ATTRIBUTES.store_id] = store_id
        if record_id:
            attributes[MEMORY_ATTRIBUTES.record_id] = record_id
        resolved_count = count if count is not None else (len(records) if records else None)
        if resolved_count is not None:
            attributes[MEMORY_ATTRIBUTES.record_count] = resolved_count
        if query:
            attributes[MEMORY_ATTRIBUTES.query_text] = query
        if capture_content and records:
            redacted = self._redact(list(records), {"operation": operation, "store_id": store_id})
            attributes[MEMORY_ATTRIBUTES.records] = _stringify(redacted)
        return attributes

    def _run(
        self,
        operation: str,
        *,
        store_id: str | None = None,
        record_id: str | None = None,
        count: int | None = None,
        query: str | None = None,
        records: Sequence[MemoryRecord] | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
        records_from_result: Callable[[Any], Sequence[MemoryRecord]] | None = None,
    ) -> Any:
        context = self._resolve_context()
        sid = store_id if store_id is not None else (self._default_store_id or "")
        cc = capture_content if capture_content is not None else self._default_capture_content
        attributes = self._build_attributes(operation, sid, record_id, count, query, records, cc, context)
        span = self._latitude.get_tracer(self._scope).start_span(operation, kind=SpanKind.CLIENT, attributes=attributes)

        def _record_search(result: Any) -> None:
            if records_from_result is None:
                return
            derived = records_from_result(result)
            if derived:
                span.set_attributes(
                    self._build_attributes(
                        operation, sid, None, count if count is not None else len(derived), query, derived, cc, context
                    )
                )

        if execute is None:
            span.end()
            return None

        if inspect.iscoroutinefunction(execute):

            async def _async_run() -> Any:
                token = otel_context.attach(trace.set_span_in_context(span))
                try:
                    result = await execute()
                    _record_search(result)
                    return result
                except Exception as error:
                    span.record_exception(error)
                    span.set_status(Status(StatusCode.ERROR, str(error)))
                    raise
                finally:
                    span.end()
                    otel_context.detach(token)

            return _async_run()

        token = otel_context.attach(trace.set_span_in_context(span))
        try:
            result = execute()
        except Exception as error:
            span.record_exception(error)
            span.set_status(Status(StatusCode.ERROR, str(error)))
            span.end()
            otel_context.detach(token)
            raise

        if inspect.isawaitable(result):
            otel_context.detach(token)

            async def _await_result() -> Any:
                inner_token = otel_context.attach(trace.set_span_in_context(span))
                try:
                    awaited = await result
                    _record_search(awaited)
                    return awaited
                except Exception as error:
                    span.record_exception(error)
                    span.set_status(Status(StatusCode.ERROR, str(error)))
                    raise
                finally:
                    span.end()
                    otel_context.detach(inner_token)

            return _await_result()

        _record_search(result)
        span.end()
        otel_context.detach(token)
        return result

    def create(
        self,
        *,
        store_id: str | None = None,
        record_id: str | None = None,
        records: Sequence[MemoryRecord] | None = None,
        count: int | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
    ) -> Any:
        return self._run(
            "create_memory",
            store_id=store_id,
            record_id=record_id,
            records=records,
            count=count,
            capture_content=capture_content,
            execute=execute,
        )

    def update(
        self,
        *,
        store_id: str | None = None,
        record_id: str | None = None,
        records: Sequence[MemoryRecord] | None = None,
        count: int | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
    ) -> Any:
        return self._run(
            "update_memory",
            store_id=store_id,
            record_id=record_id,
            records=records,
            count=count,
            capture_content=capture_content,
            execute=execute,
        )

    def upsert(
        self,
        *,
        store_id: str | None = None,
        record_id: str | None = None,
        records: Sequence[MemoryRecord] | None = None,
        count: int | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
    ) -> Any:
        return self._run(
            "upsert_memory",
            store_id=store_id,
            record_id=record_id,
            records=records,
            count=count,
            capture_content=capture_content,
            execute=execute,
        )

    def delete(
        self,
        *,
        store_id: str | None = None,
        record_id: str | None = None,
        count: int | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
    ) -> Any:
        """Omit `record_id` to signal a whole-store wipe."""
        return self._run(
            "delete_memory",
            store_id=store_id,
            record_id=record_id,
            count=count,
            capture_content=capture_content,
            execute=execute,
        )

    def search(
        self,
        *,
        store_id: str | None = None,
        query: str | None = None,
        records: Sequence[MemoryRecord] | None = None,
        count: int | None = None,
        capture_content: bool | None = None,
        execute: Callable[[], Any] | None = None,
        records_from_result: Callable[[Any], Sequence[MemoryRecord]] | None = None,
    ) -> Any:
        return self._run(
            "search_memory",
            store_id=store_id,
            query=query,
            records=records,
            count=count,
            capture_content=capture_content,
            execute=execute,
            records_from_result=records_from_result,
        )

    def create_store(self, *, store_id: str | None = None, execute: Callable[[], Any] | None = None) -> Any:
        return self._run("create_memory_store", store_id=store_id, execute=execute)

    def delete_store(self, *, store_id: str | None = None, execute: Callable[[], Any] | None = None) -> Any:
        return self._run("delete_memory_store", store_id=store_id, execute=execute)


def create_memory_telemetry(
    latitude: "Latitude",
    *,
    scope: str = "memory",
    store_id: str | None = None,
    context: ContextInput = None,
    capture_content: bool = False,
    redact: RedactFn | None = None,
) -> MemoryTelemetry:
    return MemoryTelemetry(
        latitude,
        scope=scope,
        store_id=store_id,
        context=context,
        capture_content=capture_content,
        redact=redact,
    )
