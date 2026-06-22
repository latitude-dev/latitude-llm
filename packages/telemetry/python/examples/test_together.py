"""
Together AI — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- TOGETHER_API_KEY

Install: uv add together
"""

import json
import os
import uuid

import together
from together import Together

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"togetherai": together},
    disable_batch=True,
)

PROVIDER = "togetherai"
MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str | None:
    client = Together()
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": "Say 'Hello from Together!' in exactly 5 words."}],
        max_tokens=50,
    )
    return response.choices[0].message.content


def tool_conversation() -> str | None:
    client = Together()
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get the current weather for a city",
                "parameters": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                    "required": ["city"],
                },
            },
        }
    ]
    messages = [
        {
            "role": "user",
            "content": "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
        }
    ]

    first = client.chat.completions.create(model=MODEL, messages=messages, tools=tools, max_tokens=200)
    tool_call = first.choices[0].message.tool_calls[0]
    messages.append(first.choices[0].message)
    messages.append(
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps({"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"}),
        }
    )

    second = client.chat.completions.create(model=MODEL, messages=messages, tools=tools, max_tokens=200)
    return second.choices[0].message.content


if __name__ == "__main__":
    tool_conversation()

    capture("togetherai-chat-capture", chat, _ctx("chat"))
    capture("togetherai-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
