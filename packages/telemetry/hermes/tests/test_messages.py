"""Message normalization: empty turns must not become empty bubbles in Latitude."""

from __future__ import annotations

from latitude_telemetry_hermes.messages import _normalize_assistant, _normalize_messages


def test_normalize_messages_drops_empty_user_and_unknown_roles():
    out = _normalize_messages(
        [
            {"role": "user", "content": "hello"},
            {"role": "user", "content": ""},
            {"role": "user", "content": "   "},
            {"role": "user", "content": None},
            {"role": "developer", "content": ""},
            {"role": "assistant", "content": ""},
        ]
    )
    assert out == [{"role": "user", "parts": [{"type": "text", "content": "hello"}]}]


def test_normalize_messages_keeps_tool_only_assistant_without_empty_text():
    out = _normalize_messages(
        [
            {"role": "user", "content": "check weather"},
            {
                "role": "assistant",
                "content": "",
                "tool_calls": [{"id": "1", "function": {"name": "get_weather", "arguments": '{"city":"SF"}'}}],
            },
            {"role": "tool", "tool_call_id": "1", "content": "sunny"},
            {"role": "assistant", "content": "It's sunny."},
        ]
    )
    assert out == [
        {"role": "user", "parts": [{"type": "text", "content": "check weather"}]},
        {
            "role": "assistant",
            "parts": [{"type": "tool_call", "id": "1", "name": "get_weather", "arguments": {"city": "SF"}}],
        },
        {"role": "tool", "parts": [{"type": "tool_call_response", "id": "1", "response": "sunny"}]},
        {"role": "assistant", "parts": [{"type": "text", "content": "It's sunny."}]},
    ]


def test_normalize_messages_drops_empty_text_blocks_but_keeps_siblings():
    out = _normalize_messages(
        [
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": ""},
                    {"type": "tool_use", "id": "t1", "name": "read", "input": {"path": "a"}},
                ],
            }
        ]
    )
    assert out == [
        {
            "role": "assistant",
            "parts": [{"type": "tool_call", "id": "t1", "name": "read", "arguments": {"path": "a"}}],
        }
    ]


def test_normalize_assistant_returns_none_for_empty_output():
    assert _normalize_assistant(None) is None
    assert _normalize_assistant("") is None
    assert _normalize_assistant("   ") is None
    assert _normalize_assistant({"content": "", "tool_calls": []}) is None


def test_normalize_assistant_keeps_tool_calls_without_empty_text():
    out = _normalize_assistant(
        {
            "content": "",
            "tool_calls": [{"id": "c1", "function": {"name": "bash", "arguments": '{"cmd":"ls"}'}}],
        }
    )
    assert out == {
        "role": "assistant",
        "parts": [{"type": "tool_call", "id": "c1", "name": "bash", "arguments": {"cmd": "ls"}}],
    }
