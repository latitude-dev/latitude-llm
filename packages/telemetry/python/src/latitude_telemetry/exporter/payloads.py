from typing import List, Optional

from latitude_telemetry.util import Field, Model


class AttributeValue(Model):
    string: Optional[str] = Field(default=None, alias=str("stringValue"))
    integer: Optional[int] = Field(default=None, alias=str("intValue"))
    boolean: Optional[bool] = Field(default=None, alias=str("boolValue"))


class Attribute(Model):
    key: str
    value: AttributeValue


class Resource(Model):
    attributes: List[Attribute]


class Status(Model):
    code: int
    message: Optional[str] = None


class Event(Model):
    name: str
    time: str = Field(alias=str("timeUnixNano"))
    attributes: Optional[List[Attribute]] = None


class Link(Model):
    trace_id: str = Field(alias=str("traceId"))
    span_id: str = Field(alias=str("spanId"))
    attributes: Optional[List[Attribute]] = None


class Span(Model):
    trace_id: str = Field(alias=str("traceId"))
    span_id: str = Field(alias=str("spanId"))
    parent_span_id: Optional[str] = Field(default=None, alias=str("parentSpanId"))
    name: str
    kind: int
    start_time: str = Field(alias=str("startTimeUnixNano"))
    end_time: Optional[str] = Field(default=None, alias=str("endTimeUnixNano"))
    status: Optional[Status] = None
    events: Optional[List[Event]] = None
    links: Optional[List[Link]] = None
    attributes: Optional[List[Attribute]] = None


class ScopeSpan(Model):
    spans: List[Span]


class ResourceSpan(Model):
    resource: Resource
    scope_spans: List[ScopeSpan] = Field(alias=str("scopeSpans"))


class CreateTraceRequestBody(Model):
    resource_spans: List[ResourceSpan] = Field(alias=str("resourceSpans"))
