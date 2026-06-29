import json
from collections.abc import Generator, Sequence
from contextlib import contextmanager
from typing import Any, cast

from opentelemetry.context import Context
from opentelemetry.trace import Link, Span, SpanKind, Tracer
from opentelemetry.util.types import Attributes, AttributeValue

from latitude_telemetry.constants import ATTRIBUTES, SCOPE_LATITUDE
from latitude_telemetry.sdk._deprecation import warn_project_slug_deprecated
from latitude_telemetry.sdk.types import ContextOptions


def _scope_name(scope: str) -> str:
    return scope if scope == SCOPE_LATITUDE or scope.startswith(f"{SCOPE_LATITUDE}.") else f"{SCOPE_LATITUDE}.{scope}"


LatitudeAttributes = dict[str, AttributeValue]


def latitude_attributes_from_context(options: ContextOptions) -> LatitudeAttributes:
    attributes: LatitudeAttributes = {}
    project = options.get("project")
    if project is None and "project_slug" in options:
        warn_project_slug_deprecated("capture")
        project = options.get("project_slug")

    tags = options.get("tags")
    metadata = options.get("metadata")
    session_id = options.get("session_id")
    user_id = options.get("user_id")
    user_email = options.get("user_email")
    if tags:
        attributes[ATTRIBUTES.tags] = json.dumps(tags)
    if metadata:
        attributes[ATTRIBUTES.metadata] = json.dumps(metadata)
    if session_id:
        attributes[ATTRIBUTES.session_id] = session_id
    if user_id:
        attributes[ATTRIBUTES.user_id] = user_id
    if user_email:
        attributes[ATTRIBUTES.user_email] = user_email
    if project:
        attributes[ATTRIBUTES.project] = project

    return attributes


class _LatitudeTracer:
    def __init__(self, tracer: Tracer, attributes: LatitudeAttributes):
        self._tracer = tracer
        self._attributes = attributes

    def start_span(
        self,
        name: str,
        context: Context | None = None,
        kind: SpanKind = SpanKind.INTERNAL,
        attributes: Attributes | None = None,
        links: Sequence[Link] | None = None,
        start_time: int | None = None,
        record_exception: bool = True,
        set_status_on_exception: bool = True,
    ) -> Span:
        span = self._tracer.start_span(
            name,
            context=context,
            kind=kind,
            attributes=attributes,
            links=links,
            start_time=start_time,
            record_exception=record_exception,
            set_status_on_exception=set_status_on_exception,
        )
        span.set_attributes(self._attributes)
        return span

    @contextmanager
    def start_as_current_span(
        self,
        name: str,
        context: Context | None = None,
        kind: SpanKind = SpanKind.INTERNAL,
        attributes: Attributes | None = None,
        links: Sequence[Link] | None = None,
        start_time: int | None = None,
        record_exception: bool = True,
        set_status_on_exception: bool = True,
        end_on_exit: bool = True,
    ) -> Generator[Span, None, None]:
        with self._tracer.start_as_current_span(
            name,
            context=context,
            kind=kind,
            attributes=attributes,
            links=links,
            start_time=start_time,
            record_exception=record_exception,
            set_status_on_exception=set_status_on_exception,
            end_on_exit=end_on_exit,
        ) as span:
            span.set_attributes(self._attributes)
            yield span

    def __getattr__(self, name: str) -> Any:
        return getattr(self._tracer, name)


def with_latitude_attributes(tracer: Tracer, attributes: LatitudeAttributes) -> Tracer:
    if not attributes:
        return tracer
    return cast(Tracer, _LatitudeTracer(tracer, attributes))


def get_latitude_tracer(provider: Any, scope: str, context: ContextOptions | None = None) -> Tracer:
    tracer = provider.get_tracer(_scope_name(scope))
    if context is None:
        return tracer
    return with_latitude_attributes(tracer, latitude_attributes_from_context(context))
