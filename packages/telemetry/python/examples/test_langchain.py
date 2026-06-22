"""
LangChain — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add langchain-core langchain-openai
"""

import json
import os
import uuid

import langchain_core

from latitude_telemetry import Latitude, capture

# Initialize telemetry before importing the langchain integrations so the callback patch lands.
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"langchain": langchain_core},
    disable_batch=True,
)

from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

PROVIDER = "langchain"
MODEL = "gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


@tool
def get_weather(city: str) -> str:
    """Get the current weather for a city"""
    return json.dumps({"city": city, "temperatureC": 21, "conditions": "sunny"})


def chat() -> str:
    llm = ChatOpenAI(model=MODEL, max_tokens=50)
    response = llm.invoke([HumanMessage(content="Say 'Hello from LangChain!' in exactly 5 words.")])
    return str(response.content)


def stream() -> str:
    llm = ChatOpenAI(model=MODEL, max_tokens=50)
    chunks: list[str] = []
    for chunk in llm.stream([HumanMessage(content="Say 'Hello from LangChain stream!' in exactly 6 words.")]):
        if chunk.content:
            chunks.append(str(chunk.content))
    return "".join(chunks)


def tool_conversation() -> str:
    llm = ChatOpenAI(model=MODEL, max_tokens=200).bind_tools([get_weather])
    messages = [
        HumanMessage(content="What's the weather in San Francisco? Use get_weather, then answer in one short sentence.")
    ]

    first = llm.invoke(messages)
    messages.append(first)
    for tool_call in first.tool_calls:
        result = get_weather.invoke(tool_call["args"])
        messages.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))

    second = llm.invoke(messages)
    return str(second.content)


if __name__ == "__main__":
    tool_conversation()

    capture("langchain-chat-capture", chat, _ctx("chat"))
    capture("langchain-stream-capture", stream, _ctx("stream", "stream"))
    capture("langchain-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
