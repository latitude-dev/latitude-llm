"""
Haystack — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add haystack-ai
"""

import json
import os
import uuid

import haystack
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.components.tools import ToolInvoker
from haystack.dataclasses import ChatMessage
from haystack.tools import Tool

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"haystack": haystack},
    disable_batch=True,
)

PROVIDER = "haystack"
MODEL = "gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def get_weather(city: str) -> str:
    return json.dumps({"city": city, "temperatureC": 21, "conditions": "sunny"})


weather_tool = Tool(
    name="get_weather",
    description="Get the current weather for a city",
    parameters={"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]},
    function=get_weather,
)


def chat() -> str:
    generator = OpenAIChatGenerator(model=MODEL)
    result = generator.run(messages=[ChatMessage.from_user("Say 'Hello from Haystack!' in exactly 5 words.")])
    return result["replies"][0].text or ""


def stream() -> str:
    chunks: list[str] = []
    generator = OpenAIChatGenerator(model=MODEL, streaming_callback=lambda chunk: chunks.append(chunk.content or ""))
    generator.run(messages=[ChatMessage.from_user("Say 'Hello from Haystack stream!' in exactly 6 words.")])
    return "".join(chunks)


def tool_conversation() -> str:
    generator = OpenAIChatGenerator(model=MODEL, tools=[weather_tool])
    invoker = ToolInvoker(tools=[weather_tool])

    messages = [
        ChatMessage.from_user(
            "What's the weather in San Francisco? Use get_weather, then answer in one short sentence."
        )
    ]
    first = generator.run(messages=messages)
    replies = first["replies"]
    messages.extend(replies)

    if replies and replies[0].tool_calls:
        tool_messages = invoker.run(messages=replies)["tool_messages"]
        messages.extend(tool_messages)
        final = generator.run(messages=messages)
        return final["replies"][0].text or ""

    return replies[0].text or "" if replies else ""


if __name__ == "__main__":
    tool_conversation()

    capture("haystack-chat-capture", chat, _ctx("chat"))
    capture("haystack-stream-capture", stream, _ctx("stream", "stream"))
    capture("haystack-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
