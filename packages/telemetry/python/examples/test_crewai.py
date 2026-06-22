"""
CrewAI — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY (CrewAI uses OpenAI by default)

Install: uv add crewai
"""

import json
import os
import uuid

import crewai
from crewai import Agent, Crew, Task
from crewai.tools import tool

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"crewai": crewai},
    disable_batch=True,
)

PROVIDER = "crewai"
MODEL = "gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


@tool("get_weather")
def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return json.dumps({"city": city, "temperatureC": 21, "conditions": "sunny"})


def crew() -> str:
    researcher = Agent(
        role="Researcher",
        goal="Research and summarize topics concisely",
        backstory="You are a skilled researcher who provides brief, accurate summaries.",
        llm=MODEL,
        verbose=False,
    )
    task = Task(
        description="Explain what OpenTelemetry is in exactly one sentence.",
        expected_output="A single sentence explanation of OpenTelemetry.",
        agent=researcher,
    )
    return Crew(agents=[researcher], tasks=[task], verbose=False).kickoff().raw


def tool_conversation() -> str:
    reporter = Agent(
        role="Weather Reporter",
        goal="Report the weather for a city using the available tools",
        backstory="You always call the get_weather tool before answering.",
        tools=[get_weather],
        llm=MODEL,
        verbose=False,
    )
    task = Task(
        description="What's the weather in San Francisco? Use the get_weather tool, then answer in one short sentence.",
        expected_output="A single short sentence about the weather in San Francisco.",
        agent=reporter,
    )
    return Crew(agents=[reporter], tasks=[task], verbose=False).kickoff().raw


if __name__ == "__main__":
    tool_conversation()

    capture("crewai-crew-capture", crew, _ctx("crew"))
    capture("crewai-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
