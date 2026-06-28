"""
AWS Bedrock — Latitude telemetry example.

Uses the Bedrock `converse` / `converse_stream` API (better instrumentation
support than `invoke_model`). Credentials are resolved via the default AWS
credential chain (env vars, shared config, SSO, instance role).

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- AWS credentials via the default chain (and AWS_REGION; default eu-central-1)

Install: uv add boto3
"""

import os
import uuid

import boto3

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"bedrock": boto3},
    disable_batch=True,
)

PROVIDER = "bedrock"
# Cross-region inference profile for eu-central-1; the instrumentor strips the
# `eu.` prefix -> vendor "anthropic", model "claude-opus-4-8" for cost lookup.
MODEL = "eu.anthropic.claude-opus-4-8"
MAX_TOKENS = 1024
REGION = os.environ.get("AWS_REGION", "eu-central-1")
# converse `system` is the out-of-band system field — verify it lands in systemInstructions.
SYSTEM = "You are a helpful assistant participating in a telemetry QA test. Keep answers concise."
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _client():
    return boto3.client("bedrock-runtime", region_name=REGION)


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, "bedrock-py", *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    response = _client().converse(
        modelId=MODEL,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [{"text": "Say 'Hello from Bedrock!' in exactly 5 words."}]}],
        inferenceConfig={"maxTokens": MAX_TOKENS},
    )
    return response["output"]["message"]["content"][0]["text"]


def stream() -> str:
    response = _client().converse_stream(
        modelId=MODEL,
        system=[{"text": SYSTEM}],
        messages=[{"role": "user", "content": [{"text": "Say 'Hello from Bedrock stream!' in exactly 6 words."}]}],
        inferenceConfig={"maxTokens": MAX_TOKENS},
    )
    chunks: list[str] = []
    for event in response["stream"]:
        delta = event.get("contentBlockDelta", {}).get("delta", {})
        if "text" in delta:
            chunks.append(delta["text"])
    return "".join(chunks)


def tool_conversation() -> str:
    client = _client()
    tool_config = {
        "tools": [
            {
                "toolSpec": {
                    "name": "get_weather",
                    "description": "Get the current weather for a city",
                    "inputSchema": {
                        "json": {
                            "type": "object",
                            "properties": {"city": {"type": "string"}},
                            "required": ["city"],
                        }
                    },
                }
            }
        ]
    }
    messages = [
        {
            "role": "user",
            "content": [
                {"text": "What's the weather in San Francisco? Use get_weather, then answer in one short sentence."}
            ],
        }
    ]

    first = client.converse(
        modelId=MODEL,
        system=[{"text": SYSTEM}],
        messages=messages,
        toolConfig=tool_config,
        inferenceConfig={"maxTokens": MAX_TOKENS},
    )
    out_message = first["output"]["message"]
    messages.append(out_message)
    tool_use = next(b["toolUse"] for b in out_message["content"] if "toolUse" in b)
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "toolResult": {
                        "toolUseId": tool_use["toolUseId"],
                        "content": [{"json": {"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"}}],
                    }
                }
            ],
        }
    )

    second = client.converse(
        modelId=MODEL,
        system=[{"text": SYSTEM}],
        messages=messages,
        toolConfig=tool_config,
        inferenceConfig={"maxTokens": MAX_TOKENS},
    )
    return "".join(b.get("text", "") for b in second["output"]["message"]["content"])


if __name__ == "__main__":
    capture("bedrock-chat-capture", chat, _ctx("chat"))
    capture("bedrock-stream-capture", stream, _ctx("stream", "stream"))
    capture("bedrock-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
