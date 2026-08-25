"""Responses/Codex dialect normalization.

Hermes's Codex api_mode replays the conversation as Responses API *items*, not
Chat Completions messages: tool items carry no ``role`` at all and assistant
text arrives as an ``output_text`` block. Before this suite the normalizer
dropped every tool item and JSON-dumped every assistant turn.
"""

from __future__ import annotations

from typing import Any, Dict, List

from latitude_telemetry_hermes.messages import (
    _normalize_messages,
    normalize_messages,
    system_instructions_from,
)

_PART_TYPES = {"text", "reasoning", "tool_call", "tool_call_response", "blob", "uri", "file"}


def _responses_turn() -> List[Dict[str, Any]]:
    return [
        {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "list the repo"}]},
        {
            "type": "reasoning",
            "encrypted_content": "SECRET-BLOB",
            "summary": [{"type": "summary_text", "text": "I should look"}],
        },
        {"type": "function_call", "call_id": "call_1", "name": "terminal", "arguments": '{"cmd":"ls"}'},
        {"type": "function_call_output", "call_id": "call_1", "output": "README.md"},
        {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "One file: README.md"}]},
    ]


def test_responses_items_round_trip_into_latitude_parts():
    out = _normalize_messages(_responses_turn())
    assert out == [
        {"role": "user", "parts": [{"type": "text", "content": "list the repo"}]},
        {
            "role": "assistant",
            "parts": [
                {"type": "reasoning", "content": "I should look"},
                {"type": "tool_call", "id": "call_1", "name": "terminal", "arguments": {"cmd": "ls"}},
            ],
        },
        {"role": "tool", "parts": [{"type": "tool_call_response", "id": "call_1", "response": "README.md"}]},
        {"role": "assistant", "parts": [{"type": "text", "content": "One file: README.md"}]},
    ]


def test_no_part_type_outside_the_rosetta_vocabulary():
    for message in _normalize_messages(_responses_turn()):
        for part in message["parts"]:
            assert part["type"] in _PART_TYPES


def test_encrypted_reasoning_content_is_never_exported():
    dumped = str(_normalize_messages(_responses_turn()))
    assert "SECRET-BLOB" not in dumped


def test_reasoning_without_a_summary_is_skipped():
    out = _normalize_messages(
        [
            {"type": "reasoning", "encrypted_content": "x", "summary": []},
            {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "done"}]},
        ]
    )
    assert out == [{"role": "assistant", "parts": [{"type": "text", "content": "done"}]}]


def test_function_call_output_as_content_array():
    out = _normalize_messages(
        [
            {
                "type": "function_call_output",
                "call_id": "c9",
                "output": [{"type": "input_text", "text": "line one"}, {"type": "input_text", "text": "line two"}],
            }
        ]
    )
    assert out == [
        {"role": "tool", "parts": [{"type": "tool_call_response", "id": "c9", "response": "line one\nline two"}]}
    ]


def test_adjacent_function_calls_collapse_into_one_assistant_message():
    out = _normalize_messages(
        [
            {"type": "function_call", "call_id": "a", "name": "read", "arguments": '{"p":"1"}'},
            {"type": "function_call", "call_id": "b", "name": "read", "arguments": '{"p":"2"}'},
        ]
    )
    assert out == [
        {
            "role": "assistant",
            "parts": [
                {"type": "tool_call", "id": "a", "name": "read", "arguments": {"p": "1"}},
                {"type": "tool_call", "id": "b", "name": "read", "arguments": {"p": "2"}},
            ],
        }
    ]


def test_developer_role_maps_to_system():
    out = _normalize_messages([{"role": "developer", "content": "be terse"}])
    assert out == [{"role": "system", "parts": [{"type": "text", "content": "be terse"}]}]


def test_unrecognized_items_are_counted_and_exported_as_text():
    messages, unknown = normalize_messages([{"type": "web_search_call", "id": "ws_1", "status": "completed"}])
    assert unknown == 1
    assert messages[0]["parts"][0]["type"] == "text"
    assert "web_search_call" in messages[0]["parts"][0]["content"]


def test_unparsable_arguments_are_kept_as_a_string():
    out = _normalize_messages([{"type": "function_call", "call_id": "c", "name": "t", "arguments": "not json"}])
    assert out == [
        {"role": "assistant", "parts": [{"type": "tool_call", "id": "c", "name": "t", "arguments": "not json"}]}
    ]


def test_images_map_to_blob_and_uri_parts():
    out = _normalize_messages(
        [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {"type": "input_image", "image_url": "data:image/png;base64,aGk="},
                    {"type": "input_image", "image_url": "https://example.com/a.png"},
                ],
            }
        ]
    )
    assert out == [
        {
            "role": "user",
            "parts": [
                {"type": "blob", "content": "aGk=", "modality": "image", "mime_type": "image/png"},
                {"type": "uri", "uri": "https://example.com/a.png", "modality": "image"},
            ],
        }
    ]


# --- system instructions ---------------------------------------------------


def test_system_instructions_from_string_and_block_list():
    assert system_instructions_from("you are hermes") == "you are hermes"
    assert system_instructions_from([{"type": "text", "text": "a"}, {"type": "text", "text": "b"}]) == "a\nb"
    assert system_instructions_from("   ") is None
    assert system_instructions_from(None) is None


def test_system_instructions_falls_back_to_a_system_message():
    messages = [{"role": "system", "content": "from messages"}, {"role": "user", "content": "hi"}]
    assert system_instructions_from(None, messages) == "from messages"
    assert system_instructions_from(None, [{"role": "developer", "content": "dev prompt"}]) == "dev prompt"
