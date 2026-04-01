"""
Span processor that redacts sensitive attribute values before export.
"""

import re
from typing import Callable, Sequence

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor


class RedactSpanProcessor(SpanProcessor):
    """
    Redacts span attributes matching the given patterns.

    Patterns can be exact strings or compiled regex patterns.
    Matched attribute values are replaced with the mask function output.
    """

    def __init__(
        self,
        attributes: Sequence[str | re.Pattern[str]],
        mask: Callable[[str, object], str] | None = None,
    ):
        self._attributes = attributes
        self._mask = mask or (lambda _attr, _value: "******")

    def on_start(self, span: ReadableSpan, parent_context: Context | None = None) -> None:
        pass

    def on_end(self, span: ReadableSpan) -> None:
        if not hasattr(span, "_attributes") or span._attributes is None:
            return

        redacted = {}
        for key, value in span._attributes.items():
            if self._should_redact(key):
                redacted[key] = self._mask(key, value)

        if redacted:
            span._attributes = {**span._attributes, **redacted}

        if hasattr(span, "_events"):
            for event in span._events:
                if not hasattr(event, "attributes") or event.attributes is None:
                    continue
                evt_redacted = {}
                for key, value in event.attributes.items():
                    if self._should_redact(key):
                        evt_redacted[key] = self._mask(key, value)
                if evt_redacted:
                    event._attributes = {**event.attributes, **evt_redacted}

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True

    def _should_redact(self, attribute: str) -> bool:
        for pattern in self._attributes:
            if isinstance(pattern, str):
                if attribute == pattern:
                    return True
            elif isinstance(pattern, re.Pattern):
                if pattern.search(attribute):
                    return True
        return False


DEFAULT_REDACT_PATTERNS: list[str | re.Pattern[str]] = [
    re.compile(r"^http\.request\.header\.authorization$", re.IGNORECASE),
    re.compile(r"^http\.request\.header\.cookie$", re.IGNORECASE),
    re.compile(r"^http\.request\.header\.x[-_]api[-_]key$", re.IGNORECASE),
    re.compile(r"^db\.statement$", re.IGNORECASE),
]


def default_redact_span_processor() -> RedactSpanProcessor:
    return RedactSpanProcessor(attributes=DEFAULT_REDACT_PATTERNS)
