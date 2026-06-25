# ─────────────────────────── OTLP encoding ─────────────────────────────────

from __future__ import annotations

from typing import Any, Dict, List

from .config import PKG_VERSION, SCOPE_NAME
from .model import _Run
from .util import _ms_to_ns, _safe_json


def _otlp_value(value: Any) -> Dict[str, Any]:
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    return {"stringValue": _safe_json(value)}


def _encode_attrs(attrs: Dict[str, Any], allow_content: bool) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for raw_key, value in attrs.items():
        if value is None:
            continue
        gated = raw_key.endswith(":gated")
        if gated and not allow_content:
            continue
        key = raw_key[:-6] if gated else raw_key
        if (
            key == "gen_ai.response.finish_reasons"
            and isinstance(value, list)
            and all(isinstance(x, str) for x in value)
        ):
            out.append({"key": key, "value": {"arrayValue": {"values": [{"stringValue": x} for x in value]}}})
            continue
        out.append({"key": key, "value": _otlp_value(value)})
    out.append({"key": "latitude.captured.content", "value": {"boolValue": allow_content}})
    return out


def _resource_attrs() -> List[Dict[str, Any]]:
    import socket

    return [
        {"key": "service.name", "value": {"stringValue": "hermes-agent"}},
        {"key": "service.version", "value": {"stringValue": PKG_VERSION}},
        {"key": "telemetry.sdk.name", "value": {"stringValue": SCOPE_NAME}},
        {"key": "telemetry.sdk.version", "value": {"stringValue": PKG_VERSION}},
        {"key": "host.name", "value": {"stringValue": socket.gethostname()}},
    ]


def _build_otlp(run: _Run, allow_content: bool) -> Dict[str, Any]:
    spans = []
    for s in [run.root] + run.closed:
        status: Dict[str, Any] = {"code": 2 if s.outcome == "error" else 1}
        if s.error_message:
            status["message"] = s.error_message
        spans.append(
            {
                "traceId": s.trace_id,
                "spanId": s.span_id,
                "parentSpanId": s.parent_span_id,
                "name": s.name,
                "kind": 1,
                "startTimeUnixNano": _ms_to_ns(s.start_ms),
                "endTimeUnixNano": _ms_to_ns(s.end_ms if s.end_ms is not None else s.start_ms),
                "attributes": _encode_attrs(s.attrs, allow_content),
                "status": status,
            }
        )
    return {
        "resourceSpans": [
            {
                "resource": {"attributes": _resource_attrs()},
                "scopeSpans": [{"scope": {"name": SCOPE_NAME, "version": PKG_VERSION}, "spans": spans}],
            }
        ]
    }
