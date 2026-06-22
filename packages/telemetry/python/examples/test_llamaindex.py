"""
LlamaIndex — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add llama-index llama-index-llms-openai
"""

import asyncio
import json
import os
import uuid

import llama_index
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.core.tools import FunctionTool
from llama_index.llms.openai import OpenAI

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"llamaindex": llama_index},
    disable_batch=True,
)

PROVIDER = "llamaindex"
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
    """Get the current weather for a city."""
    return json.dumps({"city": city, "temperatureC": 21, "conditions": "sunny"})


def chat() -> str:
    llm = OpenAI(model=MODEL, max_tokens=50)
    return llm.complete("Say 'Hello from LlamaIndex!' in exactly 5 words.").text


def stream() -> str:
    llm = OpenAI(model=MODEL, max_tokens=50)
    chunks: list[str] = []
    for chunk in llm.stream_complete("Say 'Hello from LlamaIndex stream!' in exactly 6 words."):
        chunks.append(chunk.delta or "")
    return "".join(chunks)


def tool_conversation() -> str:
    agent = FunctionAgent(
        tools=[FunctionTool.from_defaults(fn=get_weather)],
        llm=OpenAI(model=MODEL),
        system_prompt="You are a helpful assistant. Use the tools available to you.",
    )

    async def _run():
        return await agent.run(
            "What's the weather in San Francisco? Use get_weather, then answer in one short sentence."
        )

    return str(asyncio.run(_run()))


if __name__ == "__main__":
    tool_conversation()

    capture("llamaindex-chat-capture", chat, _ctx("chat"))
    capture("llamaindex-stream-capture", stream, _ctx("stream", "stream"))
    capture("llamaindex-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
