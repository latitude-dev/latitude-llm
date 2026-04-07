"""
Span processor that redacts sensitive attribute values before export.
"""

import re
from dataclasses import dataclass
from typing import Callable, Sequence

from opentelemetry.context import Context
from opentelemetry.sdk.trace import ReadableSpan, Span, SpanProcessor


def _default_mask(attr: str, value: object) -> str:
    return "******"


class RedactSpanProcessor(SpanProcessor):
    """Span processor that redacts sensitive attributes from spans."""

    def __init__(
        self,
        attributes: Sequence[str | re.Pattern[str]],
        mask: Callable[[str, object], str] | None = None,
    ):
        self._attributes = attributes
        self._mask = mask or _default_mask
        self._processed_spans: set[int] = set()

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        pass

    def on_end(self, span: ReadableSpan) -> None:
        span_id = id(span)
        if span_id in self._processed_spans:
            return

        attributes = getattr(span, "_attributes", None)
        if attributes is None:
            return

        redacted_attrs = {}
        for key, value in attributes.items():
            if self._should_redact(key):
                redacted_attrs[key] = self._mask(key, value)

        if redacted_attrs:
            attributes.update(redacted_attrs)

        events = getattr(span, "_events", None)
        if events:
            for event in events:
                evt_attrs = getattr(event, "attributes", None) or getattr(event, "_attributes", None)
                if evt_attrs is None:
                    continue

                evt_redacted = {}
                for key, value in evt_attrs.items():
                    if self._should_redact(key):
                        evt_redacted[key] = self._mask(key, value)

                if evt_redacted:
                    evt_attrs.update(evt_redacted)

        self._processed_spans.add(span_id)

    def shutdown(self) -> None:
        self._processed_spans.clear()

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


@dataclass
class RedactSpanProcessorOptions:
    """Options for configuring the RedactSpanProcessor."""

    attributes: Sequence[str | re.Pattern[str]]
    mask: Callable[[str, object], str] | None = None


DEFAULT_REDACT_PATTERNS: list[str | re.Pattern[str]] = [
    re.compile(r"^http\.request\.header\.authorization$", re.IGNORECASE),
    re.compile(r"^http\.request\.header\.cookie$", re.IGNORECASE),
    re.compile(r"^http\.request\.header\.x[-_]api[-_]key$", re.IGNORECASE),
    re.compile(r"^db\.statement$", re.IGNORECASE),
]


def default_redact_span_processor() -> RedactSpanProcessor:
    return RedactSpanProcessor(attributes=DEFAULT_REDACT_PATTERNS)
