from __future__ import annotations

from typing import Any, Dict, List

from latitude_telemetry_prime_intellect.mapper import map_trace
from latitude_telemetry_prime_intellect.otlp import _encode_attrs, _otlp_value


def _attr_map(attrs: List[Dict[str, Any]]) -> Dict[str, Any]:
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


def _sample_trace() -> Dict[str, Any]:
    return {
        "id": "a" * 32,
        "ok": True,
        "task": {"type": "ReverseTask", "data": {"idx": 0, "name": "rev-0", "prompt": "Reverse: ab"}},
        "agent": {"model": "gpt-4.1-mini", "harness": {"type": "default"}},
        "run": {"type": "eval", "id": "eval-run-1"},
        "rewards": {"exact_match": 1.0},
        "metrics": {"turns": 1.0},
        "timing": {"start": 1_700_000_000.0, "generation": {"start": 1_700_000_000.0, "end": 1_700_000_002.0}},
        "nodes": [
            {"parent": None, "message": {"role": "system", "content": "You reverse strings."}, "sampled": False},
            {"parent": 0, "message": {"role": "user", "content": "Reverse: ab"}, "sampled": False},
            {
                "parent": 1,
                "message": {"role": "assistant", "content": "ba"},
                "sampled": True,
            },
        ],
        "calls": [
            {
                "node": 2,
                "model": "gpt-4.1-mini",
                "finish_reason": "stop",
                "usage": {"prompt_tokens": 12, "completion_tokens": 2},
                "time": {"start": 1_700_000_000.5, "end": 1_700_000_001.5},
                "endpoint": "/chat/completions",
            }
        ],
    }


def test_otlp_value_maps_scalar_types():
    assert _otlp_value(True) == {"boolValue": True}
    assert _otlp_value(7) == {"intValue": "7"}
    assert _otlp_value(1.5) == {"doubleValue": 1.5}
    assert _otlp_value("hi") == {"stringValue": "hi"}


def test_gated_content_scrubbed_when_capture_disabled():
    attrs = {"gen_ai.prompt:gated": "hello", "gen_ai.system": "openai"}
    out = _attr_map(_encode_attrs(attrs, allow_content=False))
    assert "gen_ai.prompt" not in out
    assert out["gen_ai.system"] == "openai"
    assert out["latitude.captured.content"] is False


def test_map_trace_builds_interaction_and_llm_spans():
    otlp, scores = map_trace(_sample_trace(), allow_content=True, export_scores=True, env="gsm8k-v1")
    spans = otlp["resourceSpans"][0]["scopeSpans"][0]["spans"]
    by_name = {s["name"]: s for s in spans}
    assert "interaction" in by_name
    assert "llm_request" in by_name
    assert by_name["interaction"]["traceId"] == "a" * 32

    root_attrs = _attr_map(by_name["interaction"]["attributes"])
    assert root_attrs["session.id"] == "eval-run-1"
    assert "verifiers" in root_attrs["latitude.tags"]
    assert root_attrs["verifiers.ok"] is True

    llm_attrs = _attr_map(by_name["llm_request"]["attributes"])
    assert llm_attrs["gen_ai.request.model"] == "gpt-4.1-mini"
    assert llm_attrs["gen_ai.usage.input_tokens"] == 12
    assert llm_attrs["gen_ai.usage.output_tokens"] == 2
    assert llm_attrs["gen_ai.response.finish_reasons"] == ["stop"]

    assert len(scores) == 1
    assert scores[0]["trace"] == {"by": "id", "id": "a" * 32}
    assert scores[0]["value"] == 1.0
    assert scores[0]["passed"] is True
    assert scores[0]["sourceId"] == "verifiers.reward.exact_match"


def test_map_trace_emits_tool_execution_spans():
    trace = _sample_trace()
    trace["nodes"] = [
        {"parent": None, "message": {"role": "user", "content": "use the tool"}, "sampled": False},
        {
            "parent": 0,
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "function": {"name": "reverse", "arguments": '{"text":"ab"}'},
                    }
                ],
            },
            "sampled": True,
        },
        {
            "parent": 1,
            "message": {"role": "tool", "tool_call_id": "call_1", "content": "ba", "name": "reverse"},
            "sampled": False,
        },
        {"parent": 2, "message": {"role": "assistant", "content": "ba"}, "sampled": True},
    ]
    trace["calls"] = [
        {
            "node": 1,
            "model": "gpt-4.1-mini",
            "finish_reason": "tool_calls",
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            "time": {"start": 1.0, "end": 2.0},
        },
        {
            "node": 3,
            "model": "gpt-4.1-mini",
            "finish_reason": "stop",
            "usage": {"prompt_tokens": 20, "completion_tokens": 2},
            "time": {"start": 3.0, "end": 4.0},
        },
    ]
    otlp, _ = map_trace(trace, allow_content=True, export_scores=False)
    names = [s["name"] for s in otlp["resourceSpans"][0]["scopeSpans"][0]["spans"]]
    assert "tool_call:reverse" in names
    assert names.count("llm_request") == 2


def test_map_trace_preserves_verifiers_trace_id():
    otlp, _ = map_trace(_sample_trace(), allow_content=False, export_scores=False)
    spans = otlp["resourceSpans"][0]["scopeSpans"][0]["spans"]
    assert all(s["traceId"] == "a" * 32 for s in spans)
