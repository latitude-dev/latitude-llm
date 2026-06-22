"""
OpenAI Agents SDK — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai-agents
"""

import asyncio
import os
import uuid

import agents
from agents import Agent, Runner, function_tool

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"openai-agents": agents},
    disable_batch=True,
)

PROVIDER = "openai-agents"
MODEL = "gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


@function_tool
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return f"The weather in {city} is sunny and 21°C."


def chat() -> str:
    agent = Agent(name="Greeter", instructions="Answer concisely.", model=MODEL)
    return asyncio.run(Runner.run(agent, "Say 'Hello from OpenAI Agents!' in exactly 5 words.")).final_output


def tool_conversation() -> str:
    agent = Agent(
        name="Weather agent",
        instructions="Answer weather questions concisely. Always call get_weather first.",
        tools=[get_weather],
        model=MODEL,
    )
    result = asyncio.run(
        Runner.run(agent, "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.")
    )
    return result.final_output


if __name__ == "__main__":
    tool_conversation()

    capture("openai-agents-chat-capture", chat, _ctx("chat"))
    capture("openai-agents-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
