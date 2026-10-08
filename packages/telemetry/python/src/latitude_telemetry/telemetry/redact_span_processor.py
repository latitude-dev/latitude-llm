"""
Span processor that redacts sensitive attribute values before export.
"""

import logging
import re
import weakref
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Callable, Sequence

from opentelemetry.attributes import BoundedAttributes
from opentelemetry.context import Context
from opentelemetry.sdk.trace import Event, ReadableSpan, Span, SpanProcessor
from opentelemetry.sdk.util import BoundedList

from latitude_telemetry.constants import ATTRIBUTES

logger = logging.getLogger(__name__)

# Used when a custom `mask` raises or returns something that isn't a valid attribute value: fail
# closed (mask) rather than leak the raw value or drop the span.
FALLBACK_MASK = "******"


# Which operation a span is and which provider/model served it. Latitude needs them to count the
# span in cost and usage rollups, attribute it to a model and price it, so regex patterns never mask
# them. They name a model, not user data. Listing one as an exact string pattern still redacts it.
REDACTION_EXEMPT_ATTRIBUTES: frozenset[str] = frozenset(
    {
        ATTRIBUTES.operation_name,
        ATTRIBUTES.provider_name,
        ATTRIBUTES.system,
        ATTRIBUTES.request_model,
        ATTRIBUTES.response_model,
    }
)


def _default_mask(attr: str, value: object) -> str:
    return FALLBACK_MASK


def _with_values(original: object, values: Mapping[str, Any]) -> BoundedAttributes:
    """An immutable attribute copy holding `values`, keeping the original's dropped count."""
    copy = BoundedAttributes(maxlen=None, attributes=values, immutable=True)
    copy.dropped = getattr(original, "dropped", 0)
    return copy


class RedactSpanProcessor(SpanProcessor):
    """
    Span processor that redacts sensitive attributes (span and event attributes) from spans.

    Ended spans' attributes are frozen by OpenTelemetry, so redaction never writes into them:
    `redact_attributes` / `redact_events` return redacted copies, which `LatitudeSpanProcessor`
    applies to an export-time view of the span. Used standalone, `on_end` points the ended span
    snapshot at redacted copies so processors after it export redacted values. Redaction never
    raises: a pattern or `mask` failure masks that value with `FALLBACK_MASK`.

    Regex patterns never match `REDACTION_EXEMPT_ATTRIBUTES`; an exact string pattern does.
    """

    def __init__(
        self,
        attributes: Sequence[str | re.Pattern[str]],
        mask: Callable[[str, object], str] | None = None,
    ):
        self._attributes = attributes
        self._mask = mask or _default_mask
        self._processed_spans: weakref.WeakSet[ReadableSpan] = weakref.WeakSet()

    def on_start(self, span: Span, parent_context: Context | None = None) -> None:
        pass

    def on_end(self, span: ReadableSpan) -> None:
        try:
            if span in self._processed_spans:
                return
        except TypeError:  # not weak-referenceable
            pass
        try:
            self._redact_in_place(span)
        except Exception:
            logger.warning("[Latitude] Failed to redact span %r", getattr(span, "name", None), exc_info=True)
        try:
            self._processed_spans.add(span)
        except TypeError:
            pass  # not weak-referenceable: can't remember it, so a repeat on_end redacts again

    def shutdown(self) -> None:
        self._processed_spans.clear()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True

    def redact_attributes(self, attributes: Mapping[str, Any] | None) -> dict[str, Any] | None:
        """A copy of `attributes` with matching values masked, or None when nothing matches."""
        if not attributes:
            return None
        redacted: dict[str, Any] | None = None
        for key, value in attributes.items():
            if self._should_redact(key):
                if redacted is None:
                    redacted = dict(attributes)
                redacted[key] = self._masked(key, value)
        return redacted

    def redact_events(self, events: Iterable[Event]) -> list[Event] | None:
        """Copies of `events` with matching attribute values masked, or None when nothing matches."""
        events = list(events)
        changed = False
        out: list[Event] = []
        for event in events:
            redacted = self.redact_attributes(event.attributes)
            if redacted is None:
                out.append(event)
            else:
                changed = True
                out.append(Event(event.name, _with_values(event.attributes, redacted), event.timestamp))
        return out if changed else None

    def _redact_in_place(self, span: ReadableSpan) -> None:
        attributes = self.redact_attributes(span.attributes)
        if attributes is not None:
            span._attributes = _with_values(getattr(span, "_attributes", None), attributes)  # pyright: ignore[reportPrivateUsage]
        events = self.redact_events(span.events)
        if events is not None:
            original = getattr(span, "_events", None)
            bounded: BoundedList[Event] = BoundedList(None)
            bounded.extend(events)
            bounded.dropped = getattr(original, "dropped", 0)
            span._events = bounded  # pyright: ignore[reportPrivateUsage]

    def _masked(self, key: str, value: object) -> Any:
        try:
            masked = self._mask(key, value)
        except Exception:
            logger.warning("[Latitude] Redaction mask raised for %r; masking with the fallback", key, exc_info=True)
            return FALLBACK_MASK
        if isinstance(masked, (str, bool, int, float)):
            return masked
        logger.warning("[Latitude] Redaction mask returned a non-attribute value for %r; using the fallback", key)
        return FALLBACK_MASK

    def _should_redact(self, attribute: str) -> bool:
        for pattern in self._attributes:
            try:
                if isinstance(pattern, str):
                    if attribute == pattern:
                        return True
                elif isinstance(pattern, re.Pattern):
                    if attribute not in REDACTION_EXEMPT_ATTRIBUTES and pattern.search(attribute):
                        return True
            except Exception:
                # Fail closed: a broken pattern redacts rather than leaks.
                logger.warning("[Latitude] Redaction pattern %r failed; redacting %r", pattern, attribute)
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
