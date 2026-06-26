"""
Anthropic — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- ANTHROPIC_API_KEY

Install: uv add anthropic
"""

import json
import os
import uuid

import anthropic
from anthropic import Anthropic

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"anthropic": anthropic},
    disable_batch=True,
)

PROVIDER = "anthropic"
MODEL = "claude-opus-4-8"
MAX_TOKENS = 1024
# Anthropic delivers system instructions out-of-band (top-level `system` param), NOT as a
# role:"system" message — we verify Latitude lands it in systemInstructions.
SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"

client = Anthropic()


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, "anthropic-py", *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM,
        messages=[{"role": "user", "content": "Say 'Hello from Anthropic!' in exactly 5 words."}],
    )
    block = response.content[0]
    return block.text if block.type == "text" else ""


def stream() -> str:
    chunks: list[str] = []
    with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM,
        messages=[{"role": "user", "content": "Say 'Hello from Anthropic stream!' in exactly 6 words."}],
    ) as s:
        for text in s.text_stream:
            chunks.append(text)
    return "".join(chunks)


def tool_conversation() -> str:
    tools = [
        {
            "name": "get_weather",
            "description": "Get the current weather for a city",
            "input_schema": {
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        }
    ]
    messages = [
        {
            "role": "user",
            "content": "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
        }
    ]

    first = client.messages.create(model=MODEL, max_tokens=MAX_TOKENS, system=SYSTEM, tools=tools, messages=messages)
    tool_use = next(b for b in first.content if b.type == "tool_use")
    messages.append({"role": "assistant", "content": first.content})
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps({"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"}),
                }
            ],
        }
    )

    second = client.messages.create(model=MODEL, max_tokens=MAX_TOKENS, system=SYSTEM, tools=tools, messages=messages)
    block = next((b for b in second.content if b.type == "text"), None)
    return block.text if block else ""


if __name__ == "__main__":
    capture("anthropic-chat-capture", chat, _ctx("chat"))
    capture("anthropic-stream-capture", stream, _ctx("stream", "stream"))
    capture("anthropic-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
