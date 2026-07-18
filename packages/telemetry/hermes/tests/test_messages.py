"""Message normalization: empty turns must not become empty bubbles in Latitude."""

from __future__ import annotations

from latitude_telemetry_hermes.builder import _last_user_text
from latitude_telemetry_hermes.messages import (
    _count_tool_calls,
    _has_content,
    _normalize_assistant,
    _normalize_messages,
)


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


def test_count_tool_calls_includes_content_list_tool_use():
    assistant = {
        "content": [{"type": "tool_use", "id": "t1", "name": "read", "input": {"path": "a"}}],
    }
    assert _count_tool_calls(assistant) == 1
    assert _has_content(assistant, 0) is False


def test_last_user_text_does_not_backfill_from_older_prompt():
    messages = [
        {"role": "user", "content": "old prompt"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "   "},
    ]
    assert _last_user_text(messages) is None
    assert _last_user_text([{"role": "user", "content": "hello"}]) == "hello"
