"""Tests for the Latitude Hermes plugin.

Mirrors the core coverage of the old TS suite (buildOtlpRequest) plus the
pip entry-point contract: register() must wire every hook Hermes invokes.
"""

from __future__ import annotations

from typing import Any, Dict, List

from latitude_telemetry_hermes import register
from latitude_telemetry_hermes.config import PKG_VERSION, SCOPE_NAME
from latitude_telemetry_hermes.model import _Run, _Span
from latitude_telemetry_hermes.otlp import _build_otlp, _encode_attrs, _otlp_value


def _attr_map(attrs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Flatten OTLP attribute list into {key: unwrapped value}."""
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


# --- entry-point contract --------------------------------------------------


def test_register_wires_all_hermes_hooks():
    """Hermes loads the module and calls register(ctx); it must register every
    hook variant so it works across Hermes versions."""
    registered: List[str] = []

    class FakeCtx:
        def register_hook(self, name: str, fn: Any) -> None:
            registered.append(name)

    register(FakeCtx())

    assert set(registered) == {
        "pre_api_request",
        "post_api_request",
        "pre_llm_call",
        "post_llm_call",
        "pre_tool_call",
        "post_tool_call",
    }


# --- OTLP value encoding ---------------------------------------------------


def test_otlp_value_maps_scalar_types():
    assert _otlp_value(True) == {"boolValue": True}
    assert _otlp_value(7) == {"intValue": "7"}
    assert _otlp_value(1.5) == {"doubleValue": 1.5}
    assert _otlp_value("hi") == {"stringValue": "hi"}
    # non-scalars fall back to a JSON string
    assert _otlp_value({"a": 1}) == {"stringValue": '{"a": 1}'}


# --- content gating (the heart of the privacy story) -----------------------


def test_gated_content_kept_when_capture_enabled():
    attrs = {"gen_ai.prompt:gated": "hello", "gen_ai.system": "openai"}
    out = _attr_map(_encode_attrs(attrs, allow_content=True))
    # gated suffix is stripped and the value retained
    assert out["gen_ai.prompt"] == "hello"
    assert out["gen_ai.system"] == "openai"
    assert out["latitude.captured.content"] is True


def test_gated_content_scrubbed_when_capture_disabled():
    attrs = {"gen_ai.prompt:gated": "hello", "gen_ai.system": "openai"}
    out = _attr_map(_encode_attrs(attrs, allow_content=False))
    # gated attribute is dropped entirely; non-gated structural attrs remain
    assert "gen_ai.prompt" not in out
    assert out["gen_ai.system"] == "openai"
    assert out["latitude.captured.content"] is False


def test_finish_reasons_encoded_as_string_array():
    attrs = {"gen_ai.response.finish_reasons": ["stop"]}
    encoded = _encode_attrs(attrs, allow_content=True)
    fr = next(a for a in encoded if a["key"] == "gen_ai.response.finish_reasons")
    assert fr["value"] == {"arrayValue": {"values": [{"stringValue": "stop"}]}}


# --- full OTLP request shape -----------------------------------------------


def _make_run() -> _Run:
    root = _Span(
        trace_id="t",
        span_id="root",
        parent_span_id="",
        name="interaction",
        start_ms=1000,
        end_ms=2000,
        attrs={"gen_ai.prompt:gated": "secret"},
    )
    tool = _Span(
        trace_id="t",
        span_id="tool1",
        parent_span_id="root",
        name="tool_execution",
        start_ms=1100,
        end_ms=1200,
        attrs={},
        outcome="error",
        error_message="boom",
    )
    return _Run(
        trace_key="k",
        trace_id="t",
        root=root,
        session_id="s",
        task_id="task",
        closed=[tool],
    )


def test_build_otlp_resource_scope_and_spans():
    payload = _build_otlp(_make_run(), allow_content=True)
    rs = payload["resourceSpans"][0]

    resource = _attr_map(rs["resource"]["attributes"])
    assert resource["service.name"] == "hermes-agent"

    scope_span = rs["scopeSpans"][0]
    assert scope_span["scope"]["name"] == SCOPE_NAME
    assert scope_span["scope"]["version"] == PKG_VERSION

    spans = scope_span["spans"]
    assert {s["name"] for s in spans} == {"interaction", "tool_execution"}

    tool = next(s for s in spans if s["name"] == "tool_execution")
    assert tool["parentSpanId"] == "root"
    assert tool["status"]["code"] == 2  # error
    assert tool["status"]["message"] == "boom"


def test_build_otlp_respects_content_gating():
    disabled = _build_otlp(_make_run(), allow_content=False)
    root_attrs = _attr_map(disabled["resourceSpans"][0]["scopeSpans"][0]["spans"][0]["attributes"])
    assert "gen_ai.prompt" not in root_attrs
    assert root_attrs["latitude.captured.content"] is False
