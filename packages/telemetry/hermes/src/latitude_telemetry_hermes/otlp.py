# ─────────────────────────── OTLP encoding ─────────────────────────────────
# Encoding runs on the exporter thread, so the agent's turn never pays for
# redaction or serialization. It is also the single choke point every attribute
# passes through: content gating, secret redaction, attribute redaction and the
# per-attribute size budget all live here.

from __future__ import annotations

import socket
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from . import redact
from .config import PKG_VERSION, SCOPE_NAME, _config
from .model import _Span
from .util import _ms_to_ns, _safe_json

_OMISSION_ROLE = "system"


@dataclass(frozen=True)
class _EncodeOptions:
    allow_content: bool
    max_content_chars: int
    redact_secrets: bool
    redaction_available: bool
    attribute_matchers: Tuple[Callable[[str], bool], ...]
    mask: str
    service_name: str


def _encode_options() -> _EncodeOptions:
    cfg = _config()
    patterns = cfg.get("redact_attributes") or []
    redact_secrets = bool(cfg.get("redact_secrets"))
    return _EncodeOptions(
        allow_content=bool(cfg.get("allow_content")),
        max_content_chars=int(cfg.get("max_content_chars") or 0),
        redact_secrets=redact_secrets,
        redaction_available=redact.available() if redact_secrets else False,
        attribute_matchers=redact.attribute_matchers(patterns),
        mask=str(cfg.get("redact_mask") or "******"),
        service_name=str(cfg.get("service_name") or "hermes-agent"),
    )


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


def _encode_attrs(
    attrs: Dict[str, Any], allow_content: bool, options: Optional[_EncodeOptions] = None
) -> List[Dict[str, Any]]:
    opts = options or _encode_options()
    out: List[Dict[str, Any]] = []
    for raw_key, value in attrs.items():
        if value is None:
            continue
        gated = raw_key.endswith(":gated")
        if gated and not allow_content:
            continue
        key = raw_key[:-6] if gated else raw_key
        if redact.matches(key, opts.attribute_matchers):
            # A redacted key is kept, never dropped, so the Attributes panel
            # still shows what the emitter actually sent.
            out.append({"key": key, "value": {"stringValue": opts.mask}})
            continue
        if gated:
            value = _budget(value, opts.max_content_chars)
            if opts.redaction_available:
                value = redact.redact_deep(value)
        if (
            key == "gen_ai.response.finish_reasons"
            and isinstance(value, list)
            and all(isinstance(x, str) for x in value)
        ):
            out.append({"key": key, "value": {"arrayValue": {"values": [{"stringValue": x} for x in value]}}})
            continue
        out.append({"key": key, "value": _otlp_value(value)})
    out.append({"key": "latitude.captured.content", "value": {"boolValue": allow_content}})
    if opts.redact_secrets:
        out.append({"key": "hermes.redaction.applied", "value": {"boolValue": opts.redaction_available}})
    return out


def _budget(value: Any, max_chars: int) -> Any:
    """Middle-out truncation, so a pathological turn cannot produce a span that
    is too big to ship. The omission is explicit in the exported content."""
    if max_chars <= 0:
        return value
    if isinstance(value, str):
        if len(value) <= max_chars:
            return value
        half = max_chars // 2
        omitted = len(value) - 2 * half
        return f"{value[:half]}\n\n[… {omitted} characters omitted by the Latitude exporter …]\n\n{value[-half:]}"
    if not isinstance(value, list) or len(_safe_json(value)) <= max_chars:
        return value
    return _truncate_messages(value, max_chars)


def _truncate_messages(messages: List[Any], max_chars: int) -> List[Any]:
    sizes = [len(_safe_json(message)) + 1 for message in messages]
    head: List[Any] = []
    tail: List[Any] = []
    budget = max_chars - 160  # room for the marker message
    low, high = 0, len(messages) - 1
    while low <= high:
        if sizes[low] <= sizes[high] or not tail:
            if budget - sizes[low] < 0:
                break
            budget -= sizes[low]
            head.append(messages[low])
            low += 1
        else:
            if budget - sizes[high] < 0:
                break
            budget -= sizes[high]
            tail.insert(0, messages[high])
            high -= 1
    omitted = len(messages) - len(head) - len(tail)
    if omitted <= 0:
        return messages
    marker = {
        "role": _OMISSION_ROLE,
        "parts": [{"type": "text", "content": f"[… {omitted} message(s) omitted by the Latitude exporter …]"}],
    }
    return head + [marker] + tail


def _resource_attrs(service_name: Optional[str] = None) -> List[Dict[str, Any]]:
    name = service_name or _config().get("service_name") or "hermes-agent"
    return [
        {"key": "service.name", "value": {"stringValue": name}},
        {"key": "service.version", "value": {"stringValue": PKG_VERSION}},
        {"key": "telemetry.sdk.name", "value": {"stringValue": SCOPE_NAME}},
        {"key": "telemetry.sdk.version", "value": {"stringValue": PKG_VERSION}},
        {"key": "host.name", "value": {"stringValue": socket.gethostname()}},
    ]


def _encode_span(span: _Span, options: _EncodeOptions) -> Dict[str, Any]:
    status: Dict[str, Any] = {"code": 2 if span.outcome == "error" else 1}
    if span.error_message:
        status["message"] = span.error_message
    return {
        "traceId": span.trace_id,
        "spanId": span.span_id,
        "parentSpanId": span.parent_span_id,
        "name": span.name,
        "kind": span.kind,
        "startTimeUnixNano": _ms_to_ns(span.start_ms),
        "endTimeUnixNano": _ms_to_ns(span.end_ms if span.end_ms is not None else span.start_ms),
        "attributes": _encode_attrs(span.attrs, options.allow_content, options),
        "status": status,
    }


def _build_payload(encoded_spans: Sequence[Dict[str, Any]], service_name: Optional[str] = None) -> Dict[str, Any]:
    return {
        "resourceSpans": [
            {
                "resource": {"attributes": _resource_attrs(service_name)},
                "scopeSpans": [{"scope": {"name": SCOPE_NAME, "version": PKG_VERSION}, "spans": list(encoded_spans)}],
            }
        ]
    }


def _build_otlp(spans: Sequence[_Span], allow_content: Optional[bool] = None) -> Dict[str, Any]:
    """Encode a batch of finished spans into one OTLP/HTTP JSON request."""
    options = _encode_options()
    if allow_content is not None:
        options = _EncodeOptions(**{**options.__dict__, "allow_content": allow_content})
    return _build_payload([_encode_span(span, options) for span in spans], options.service_name)
