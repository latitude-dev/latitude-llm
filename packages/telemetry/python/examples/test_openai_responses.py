"""
OpenAI Responses API — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai
"""

import json
import os
import uuid

import openai
from openai import OpenAI

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai": openai},
    disable_batch=True,
)

PROVIDER = "openai-responses"
MODEL = "gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"

client = OpenAI()


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    response = client.responses.create(
        model=MODEL,
        input="Say 'Hello from OpenAI Responses!' in exactly 5 words.",
        max_output_tokens=50,
    )
    return response.output_text


def stream() -> str:
    chunks: list[str] = []
    for event in client.responses.create(
        model=MODEL,
        input="Say 'Hello from OpenAI Responses stream!' in exactly 6 words.",
        max_output_tokens=50,
        stream=True,
    ):
        if event.type == "response.output_text.delta":
            chunks.append(event.delta)
    return "".join(chunks)


def tool_conversation() -> str:
    tools = [
        {
            "type": "function",
            "name": "get_weather",
            "description": "Get the current weather for a city",
            "parameters": {
                "type": "object",
                "properties": {"city": {"type": "string"}},
                "required": ["city"],
            },
        }
    ]
    input_list: list = [
        {
            "role": "user",
            "content": "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.",
        }
    ]

    first = client.responses.create(model=MODEL, input=input_list, tools=tools, max_output_tokens=200)
    input_list += first.output
    for item in first.output:
        if item.type == "function_call":
            input_list.append(
                {
                    "type": "function_call_output",
                    "call_id": item.call_id,
                    "output": json.dumps({"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"}),
                }
            )

    second = client.responses.create(model=MODEL, input=input_list, tools=tools, max_output_tokens=200)
    return second.output_text


if __name__ == "__main__":
    tool_conversation()

    capture("openai-responses-chat-capture", chat, _ctx("chat"))
    capture("openai-responses-stream-capture", stream, _ctx("stream", "stream"))
    capture("openai-responses-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
