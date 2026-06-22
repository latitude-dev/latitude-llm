"""
Azure OpenAI — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- AZURE_OPENAI_API_KEY
- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_DEPLOYMENT (optional, default: gpt-4o)

Install: uv add openai
"""

import json
import os
import uuid

import openai

from latitude_telemetry import Latitude, capture

# Initialize telemetry BEFORE importing openai so instrumentation can patch it
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai": openai},
    disable_batch=True,
)

from openai import AzureOpenAI

PROVIDER = "azure"
DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def _client() -> AzureOpenAI:
    return AzureOpenAI(
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version="2024-02-01",
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    )


def chat() -> str | None:
    client = _client()
    response = client.chat.completions.create(
        model=DEPLOYMENT,
        messages=[{"role": "user", "content": "Say 'Hello from Azure!' in exactly 5 words."}],
        max_tokens=50,
    )
    return response.choices[0].message.content


def tool_conversation() -> str | None:
    client = _client()
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

    first = client.chat.completions.create(model=DEPLOYMENT, messages=messages, tools=tools, max_tokens=200)
    tool_call = first.choices[0].message.tool_calls[0]
    messages.append(first.choices[0].message)
    messages.append(
        {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps({"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"}),
        }
    )

    second = client.chat.completions.create(model=DEPLOYMENT, messages=messages, tools=tools, max_tokens=200)
    return second.choices[0].message.content


if __name__ == "__main__":
    tool_conversation()

    capture("azure-chat-capture", chat, _ctx("chat"))
    capture("azure-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
