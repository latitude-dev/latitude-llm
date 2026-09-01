"""Two privacy controls: secret masking inside content, and whole-attribute blanking."""

from __future__ import annotations

from typing import Any, Dict

from helpers import attr_map

import latitude_telemetry_hermes.redact as redact
from latitude_telemetry_hermes.config import reset_config
from latitude_telemetry_hermes.otlp import _encode_attrs


def _fake_hermes_redactor(monkeypatch) -> None:
    """Stand in for agent.redact.redact_sensitive_text, which only exists inside
    a real Hermes install."""
    monkeypatch.setattr(
        redact,
        "_resolve_redactor",
        lambda: (lambda text: text.replace("sk-live-abc123", "[REDACTED]")),
    )
    redact._reset_for_tests()
    monkeypatch.setattr(redact, "_REDACTOR", redact._UNSET, raising=False)


def _encode(attrs: Dict[str, Any], allow_content: bool = True) -> Dict[str, Any]:
    return attr_map(_encode_attrs(attrs, allow_content=allow_content))


def test_a_secret_in_a_tool_result_is_masked(monkeypatch):
    _fake_hermes_redactor(monkeypatch)
    out = _encode({"gen_ai.tool.call.result:gated": "export TOKEN=sk-live-abc123"})
    assert out["gen_ai.tool.call.result"] == "export TOKEN=[REDACTED]"
    assert out["hermes.redaction.applied"] is True


def test_secrets_nested_inside_a_message_array_are_masked(monkeypatch):
    _fake_hermes_redactor(monkeypatch)
    messages = [{"role": "user", "parts": [{"type": "text", "content": "use sk-live-abc123"}]}]
    out = _encode({"gen_ai.input.messages:gated": messages})
    assert "sk-live-abc123" not in out["gen_ai.input.messages"]


def test_structural_attributes_are_left_alone(monkeypatch):
    _fake_hermes_redactor(monkeypatch)
    out = _encode({"gen_ai.tool.name": "sk-live-abc123"})
    assert out["gen_ai.tool.name"] == "sk-live-abc123", "only gated content passes through the redactor"


def test_redaction_can_be_turned_off(monkeypatch):
    _fake_hermes_redactor(monkeypatch)
    monkeypatch.setenv("LATITUDE_HERMES_REDACT_SECRETS", "0")
    reset_config()
    out = _encode({"gen_ai.tool.call.result:gated": "sk-live-abc123"})
    assert out["gen_ai.tool.call.result"] == "sk-live-abc123"
    assert "hermes.redaction.applied" not in out


def test_an_unavailable_redactor_is_visible_rather_than_a_silent_claim(monkeypatch):
    monkeypatch.setattr(redact, "_resolve_redactor", lambda: None)
    redact._reset_for_tests()
    out = _encode({"gen_ai.tool.call.result:gated": "sk-live-abc123"})
    assert out["gen_ai.tool.call.result"] == "sk-live-abc123"
    assert out["hermes.redaction.applied"] is False


# --- attribute redaction ---------------------------------------------------


def test_an_exact_attribute_key_is_masked_but_kept(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_REDACT_ATTRIBUTES", "gen_ai.memory.records")
    reset_config()
    out = _encode({"gen_ai.memory.records:gated": [{"id": "MEMORY.md", "content": "private"}], "x": 1})
    assert out["gen_ai.memory.records"] == "******", "kept, never dropped: the panel still shows what was sent"
    assert out["x"] == 1


def test_a_regex_pattern_masks_every_matching_key(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_REDACT_ATTRIBUTES", "/^gen_ai\\.tool\\.call\\./i")
    monkeypatch.setenv("LATITUDE_HERMES_REDACT_MASK", "<hidden>")
    reset_config()
    out = _encode({"gen_ai.tool.call.arguments:gated": '{"cmd":"ls"}', "gen_ai.tool.name": "terminal"})
    assert out["gen_ai.tool.call.arguments"] == "<hidden>"
    assert out["gen_ai.tool.name"] == "terminal"


def test_an_unparseable_pattern_degrades_to_an_exact_match(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_REDACT_ATTRIBUTES", "gen_ai.[unclosed")
    reset_config()
    out = _encode({"gen_ai.[unclosed": "v", "other": "w"})
    assert out["gen_ai.[unclosed"] == "******"
    assert out["other"] == "w"


# --- content budget --------------------------------------------------------


def test_a_huge_string_is_truncated_middle_out(monkeypatch):
    monkeypatch.setenv("LATITUDE_HERMES_MAX_CONTENT_CHARS", "2048")
    reset_config()
    out = _encode({"user_prompt:gated": "a" * 10_000})
    assert len(out["user_prompt"]) < 10_000
    assert "omitted by the Latitude exporter" in out["user_prompt"]
    assert out["user_prompt"].startswith("a")


def test_a_huge_message_array_keeps_valid_json_and_marks_the_omission(monkeypatch):
    import json

    monkeypatch.setenv("LATITUDE_HERMES_MAX_CONTENT_CHARS", "4096")
    reset_config()
    messages = [
        {"role": "user", "parts": [{"type": "text", "content": f"message {i} " + "x" * 200}]} for i in range(100)
    ]
    out = _encode({"gen_ai.input.messages:gated": messages})
    parsed = json.loads(out["gen_ai.input.messages"])
    assert isinstance(parsed, list) and len(parsed) < 100
    assert any("omitted by the Latitude exporter" in json.dumps(m) for m in parsed)
    assert "message 0" in json.dumps(parsed[0]), "the head of the conversation survives"
