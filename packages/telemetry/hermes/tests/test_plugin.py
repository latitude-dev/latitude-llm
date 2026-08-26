"""Entry-point contract and OTLP encoding.

Hermes loads the module and calls register(ctx); the plugin must wire every
hook it consumes, and everything it exports has to survive the encoder's
gating, redaction and size budget.
"""

from __future__ import annotations

from typing import Any, Dict, List

from helpers import attr_map

import latitude_telemetry_hermes.hooks as hooks
from latitude_telemetry_hermes import register
from latitude_telemetry_hermes.builder import _Builder
from latitude_telemetry_hermes.config import PKG_VERSION, SCOPE_NAME, reset_config
from latitude_telemetry_hermes.model import _Span
from latitude_telemetry_hermes.otlp import _build_otlp, _encode_attrs, _otlp_value

# --- entry-point contract --------------------------------------------------


def _wire() -> Dict[str, Any]:
    """Run register(ctx) and return the {hook_name: callback} it wired."""
    registered: Dict[str, Any] = {}

    class FakeCtx:
        profile_name = "default"

        def get_config(self, key: str, default: Any = None) -> Any:
            return default

        def register_hook(self, name: str, fn: Any) -> None:
            registered[name] = fn

    register(FakeCtx())
    return registered


def test_register_wires_all_hermes_hooks():
    assert set(_wire()) == {
        "pre_api_request",
        "post_api_request",
        "api_request_error",
        "pre_llm_call",
        "post_llm_call",
        "pre_tool_call",
        "post_tool_call",
        "on_stream_start",
        "on_stream_delta",
        "on_stream_end",
        "on_session_start",
        "on_session_end",
        "on_session_reset",
        "on_session_finalize",
        "subagent_start",
        "subagent_stop",
    }


def test_stream_delta_registration_is_opt_out(monkeypatch):
    """Hermes builds a payload per delta once any callback is registered, so a
    user who would rather not pay it must be able to skip the subscription."""
    monkeypatch.setenv("LATITUDE_HERMES_STREAM_TTFT", "0")
    reset_config()
    assert "on_stream_delta" not in _wire()


def test_api_request_and_llm_call_hooks_bind_to_distinct_builder_methods(monkeypatch):
    """The callback families fire at different times with different kwargs, so
    each must route to its own builder method — not a shared one."""
    registered = _wire()
    monkeypatch.setattr(hooks, "_ship", lambda spans: None)

    calls: List[str] = []
    for name in ("on_pre_api_request", "on_post_api_request", "on_pre_llm_call", "on_post_llm_call"):
        monkeypatch.setattr(hooks._BUILDER, name, lambda _n=name, **kw: calls.append(_n) or [])

    for name in ("pre_api_request", "post_api_request", "pre_llm_call", "post_llm_call"):
        registered[name]()

    assert calls == ["on_pre_api_request", "on_post_api_request", "on_pre_llm_call", "on_post_llm_call"]


def test_on_session_end_finalizes_open_run_and_ships(monkeypatch):
    """A run left open when a one-shot run ends must be finalized and shipped,
    then the exporter flushed, before the process exits."""
    registered = _wire()

    fresh = _Builder()
    monkeypatch.setattr(hooks, "_BUILDER", fresh)
    shipped: List[List[_Span]] = []
    monkeypatch.setattr(hooks, "_ship", lambda spans: shipped.append(list(spans)) if spans else None)
    flushed: List[float] = []
    monkeypatch.setattr(hooks, "_flush", lambda timeout=0: flushed.append(timeout))

    registered["pre_api_request"](
        session_id="s",
        turn_id="turn-1",
        request_messages=[{"role": "user", "content": "hi"}],
        provider="openai",
        model="gpt-4",
        api_call_count=1,
    )
    assert fresh._runs, "expected an open run before session end"

    registered["on_session_end"](session_id="s")

    assert flushed == [hooks._TURN_FLUSH_SECONDS], "the turn flush stays off the critical path"
    assert len(shipped) == 1
    assert [s.name for s in shipped[0]][-1] == "interaction", "the root ships last"
    assert not fresh._runs, "the run must be finalized and removed"


def test_on_session_end_only_finalizes_its_own_session(monkeypatch):
    """In a gateway with concurrent sessions, ending one session must not pop
    or abandon runs still live in another session."""
    registered = _wire()

    fresh = _Builder()
    monkeypatch.setattr(hooks, "_BUILDER", fresh)
    shipped: List[List[_Span]] = []
    monkeypatch.setattr(hooks, "_ship", lambda spans: shipped.append(list(spans)) if spans else None)
    monkeypatch.setattr(hooks, "_flush", lambda *a, **k: None)

    for sid in ("s1", "s2"):
        registered["pre_api_request"](
            session_id=sid,
            turn_id=f"turn-{sid}",
            request_messages=[{"role": "user", "content": "hi"}],
            api_call_count=1,
        )
    assert len(fresh._runs) == 2

    registered["on_session_end"](session_id="s1")

    assert len(shipped) == 1, "only the ending session's run ships"
    remaining = list(fresh._runs.values())
    assert len(remaining) == 1 and remaining[0].session_id == "s2", "the other session stays live"


def test_a_failing_handler_never_reaches_the_agent(monkeypatch):
    registered = _wire()
    monkeypatch.setattr(hooks._BUILDER, "on_pre_tool_call", lambda **kw: 1 / 0)
    registered["pre_tool_call"](tool_name="terminal")


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
    out = attr_map(_encode_attrs({"gen_ai.prompt:gated": "hello", "gen_ai.system": "openai"}, allow_content=True))
    assert out["gen_ai.prompt"] == "hello"
    assert out["gen_ai.system"] == "openai"
    assert out["latitude.captured.content"] is True


def test_gated_content_scrubbed_when_capture_disabled():
    out = attr_map(_encode_attrs({"gen_ai.prompt:gated": "hello", "gen_ai.system": "openai"}, allow_content=False))
    assert "gen_ai.prompt" not in out
    assert out["gen_ai.system"] == "openai"
    assert out["latitude.captured.content"] is False


def test_finish_reasons_encoded_as_string_array():
    encoded = _encode_attrs({"gen_ai.response.finish_reasons": ["stop"]}, allow_content=True)
    fr = next(a for a in encoded if a["key"] == "gen_ai.response.finish_reasons")
    assert fr["value"] == {"arrayValue": {"values": [{"stringValue": "stop"}]}}


# --- full OTLP request shape -----------------------------------------------


def _spans() -> List[_Span]:
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
        name="tool_call:terminal",
        start_ms=1100,
        end_ms=1200,
        kind=3,
        outcome="error",
        error_message="boom",
    )
    return [tool, root]


def test_build_otlp_resource_scope_and_spans():
    rs = _build_otlp(_spans())["resourceSpans"][0]

    assert attr_map(rs["resource"]["attributes"])["service.name"] == "hermes-agent"

    scope_span = rs["scopeSpans"][0]
    assert scope_span["scope"]["name"] == SCOPE_NAME
    assert scope_span["scope"]["version"] == PKG_VERSION

    spans = scope_span["spans"]
    assert {s["name"] for s in spans} == {"interaction", "tool_call:terminal"}

    tool = next(s for s in spans if s["name"] == "tool_call:terminal")
    assert tool["parentSpanId"] == "root"
    assert tool["kind"] == 3, "tool spans are CLIENT, matching the claude-code emitter"
    assert tool["status"]["code"] == 2
    assert tool["status"]["message"] == "boom"


def test_build_otlp_respects_content_gating():
    encoded = _build_otlp(_spans(), allow_content=False)["resourceSpans"][0]["scopeSpans"][0]["spans"]
    root = next(s for s in encoded if s["name"] == "interaction")
    attrs = attr_map(root["attributes"])
    assert "gen_ai.prompt" not in attrs
    assert attrs["latitude.captured.content"] is False


def test_service_name_override_reaches_the_resource(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_SERVICE_NAME", "alescript")
    reset_config()
    rs = _build_otlp(_spans())["resourceSpans"][0]
    assert attr_map(rs["resource"]["attributes"])["service.name"] == "alescript"
