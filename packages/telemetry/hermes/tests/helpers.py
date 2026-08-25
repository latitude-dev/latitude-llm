"""Test helpers shared across the suite."""

from __future__ import annotations

from typing import Any, Dict, List

from latitude_telemetry_hermes.model import _Span
from latitude_telemetry_hermes.otlp import _build_otlp


def attr_map(attrs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Flatten an OTLP attribute list into {key: unwrapped value}."""
    out: Dict[str, Any] = {}
    for a in attrs:
        v = a["value"]
        if "stringValue" in v:
            out[a["key"]] = v["stringValue"]
        elif "boolValue" in v:
            out[a["key"]] = v["boolValue"]
        elif "intValue" in v:
            out[a["key"]] = int(v["intValue"])
        elif "doubleValue" in v:
            out[a["key"]] = v["doubleValue"]
        elif "arrayValue" in v:
            out[a["key"]] = [x["stringValue"] for x in v["arrayValue"]["values"]]
    return out


def encoded_spans(spans: List[_Span]) -> List[Dict[str, Any]]:
    return _build_otlp(spans)["resourceSpans"][0]["scopeSpans"][0]["spans"]


def span_attrs(spans: List[_Span], name: str) -> Dict[str, Any]:
    """The one span with this name.

    A finish can close several `llm_request` or `tool_call:<name>` spans at once, so
    silently taking the first would let a test assert against a span it did not mean.
    """
    matches = [span for span in encoded_spans(spans) if span["name"] == name]
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one {name!r} span, got {len(matches)} in {_names(spans)}")
    return attr_map(matches[0]["attributes"])


def _names(spans: List[_Span]) -> List[str]:
    return [span["name"] for span in encoded_spans(spans)]


def by_name(spans: List[_Span]) -> Dict[str, _Span]:
    """Keyed by span name; a repeated name keeps the last. Use `span_attrs` when
    the test depends on there being exactly one."""
    return {span.name: span for span in spans}
