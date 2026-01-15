from latitude_telemetry.constants.attributes import ATTRIBUTES, VALUES
from latitude_telemetry.constants.span import (
    SpanType,
    SpanKind,
    SpanStatus,
    SPAN_SPECIFICATIONS,
    LogSources,
)
from latitude_telemetry.constants.scope import (
    SCOPE_LATITUDE,
    InstrumentationScope,
)

HEAD_COMMIT = "live"

DOCUMENT_PATH_REGEXP = r"^[a-zA-Z0-9._-]+(/[a-zA-Z0-9._-]+)*$"

__all__ = [
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
]
