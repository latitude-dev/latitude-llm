from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import latitude_telemetry_prime_intellect.export as export_mod
from latitude_telemetry_prime_intellect import export_episode, export_results_dir, export_trace, make_on_complete
from latitude_telemetry_prime_intellect.config import _reset_config_for_tests


def _sample_trace() -> Dict[str, Any]:
    return {
        "id": "b" * 32,
        "ok": True,
        "task": {"type": "T", "data": {"idx": 1, "prompt": "hi"}},
        "agent": {"model": "m"},
        "run": {"id": "run-9"},
        "rewards": {"r": 0.0},
        "nodes": [
            {"parent": None, "message": {"role": "user", "content": "hi"}, "sampled": False},
            {"parent": 0, "message": {"role": "assistant", "content": "yo"}, "sampled": True},
        ],
        "calls": [
            {
                "node": 1,
                "model": "m",
                "finish_reason": "stop",
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
                "time": {"start": 10.0, "end": 11.0},
            }
        ],
        "timing": {"start": 10.0, "generation": {"end": 11.0}},
    }


def test_export_trace_ships_otlp_and_scores(monkeypatch):
    monkeypatch.setenv("LATITUDE_API_KEY", "lat_test")
    monkeypatch.setenv("LATITUDE_PROJECT", "demo")
    _reset_config_for_tests()

    shipped: List[tuple[str, Dict[str, Any]]] = []
    monkeypatch.setattr(export_mod, "_ship", lambda payload, kind="traces": shipped.append((kind, payload)))
    monkeypatch.setattr(export_mod, "_flush", lambda *a, **k: None)

    tid = export_trace(_sample_trace(), flush=True)
    assert tid == "b" * 32
    kinds = [k for k, _ in shipped]
    assert "traces" in kinds
    assert "score" in kinds


def test_export_trace_noop_without_credentials(monkeypatch):
    monkeypatch.delenv("LATITUDE_API_KEY", raising=False)
    monkeypatch.delenv("LATITUDE_PROJECT", raising=False)
    monkeypatch.delenv("LATITUDE_PROJECT_SLUG", raising=False)
    _reset_config_for_tests()

    shipped: List[Any] = []
    monkeypatch.setattr(export_mod, "_ship", lambda *a, **k: shipped.append(1))
    assert export_trace(_sample_trace()) is None
    assert shipped == []


def test_export_episode_uses_episode_session(monkeypatch):
    monkeypatch.setenv("LATITUDE_API_KEY", "lat_test")
    monkeypatch.setenv("LATITUDE_PROJECT", "demo")
    _reset_config_for_tests()

    shipped: List[Dict[str, Any]] = []
    monkeypatch.setattr(
        export_mod,
        "_ship",
        lambda payload, kind="traces": shipped.append(payload) if kind == "traces" else None,
    )
    monkeypatch.setattr(export_mod, "_flush", lambda *a, **k: None)

    episode = {"id": "ep-1", "env": "gsm8k-v1", "ok": True, "traces": [_sample_trace()]}
    ids = export_episode(episode)
    assert ids == ["b" * 32]
    spans = shipped[0]["resourceSpans"][0]["scopeSpans"][0]["spans"]
    root_attrs = {a["key"]: a["value"] for a in spans[0]["attributes"]}
    assert root_attrs["session.id"]["stringValue"] == "ep-1"


def test_make_on_complete_chains_next(monkeypatch):
    monkeypatch.setenv("LATITUDE_API_KEY", "lat_test")
    monkeypatch.setenv("LATITUDE_PROJECT", "demo")
    _reset_config_for_tests()
    monkeypatch.setattr(export_mod, "_ship", lambda *a, **k: None)
    monkeypatch.setattr(export_mod, "_flush", lambda *a, **k: None)

    seen: List[str] = []

    async def nxt(ep: Any) -> None:
        seen.append(ep["id"])

    cb = make_on_complete(next=nxt)
    import asyncio

    asyncio.run(cb({"id": "ep-x", "env": "e", "traces": [_sample_trace()]}))
    assert seen == ["ep-x"]


def test_export_results_dir_reads_jsonl(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("LATITUDE_API_KEY", "lat_test")
    monkeypatch.setenv("LATITUDE_PROJECT", "demo")
    _reset_config_for_tests()

    shipped: List[str] = []
    monkeypatch.setattr(
        export_mod,
        "_ship",
        lambda payload, kind="traces": shipped.append(kind),
    )
    monkeypatch.setattr(export_mod, "_flush", lambda *a, **k: None)

    path = tmp_path / "traces.jsonl"
    path.write_text(json.dumps(_sample_trace()) + "\n", encoding="utf-8")
    ids = export_results_dir(tmp_path)
    assert ids == ["b" * 32]
    assert "traces" in shipped
