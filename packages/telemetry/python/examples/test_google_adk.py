"""
Google ADK (Agent Development Kit) — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- GOOGLE_API_KEY (Gemini API key from Google AI Studio)

Install: uv add google-adk
"""

import asyncio
import os
import uuid

import google.adk
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"google_adk": google.adk},
    disable_batch=True,
)

PROVIDER = "google-adk"
MODEL = "gemini-2.5-flash"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def get_weather(city: str) -> dict:
    """Returns the current weather for a city."""
    return {"status": "success", "report": f"The weather in {city} is sunny and 21°C."}


def _run(agent: Agent, prompt: str) -> str:
    async def run_agent() -> str:
        app_name = "example_app"
        adk_session = uuid.uuid4().hex
        runner = InMemoryRunner(agent=agent, app_name=app_name)
        await runner.session_service.create_session(app_name=app_name, user_id="example-user", session_id=adk_session)

        final_output = ""
        async for event in runner.run_async(
            user_id="example-user",
            session_id=adk_session,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                text = event.content.parts[0].text
                if text:
                    final_output = text.strip()
        return final_output

    return asyncio.run(run_agent())


def chat() -> str:
    agent = Agent(
        name="greeter",
        model=MODEL,
        description="A concise assistant.",
        instruction="Answer concisely.",
    )
    return _run(agent, "Say 'Hello from Google ADK!' in exactly 5 words.")


def tool_conversation() -> str:
    agent = Agent(
        name="weather_agent",
        model=MODEL,
        description="Agent that answers weather questions using tools.",
        instruction="Answer weather questions concisely. Always call get_weather first.",
        tools=[get_weather],
    )
    return _run(agent, "What's the weather in San Francisco? Use get_weather, then answer in one short sentence.")


if __name__ == "__main__":
    tool_conversation()

    capture("google-adk-chat-capture", chat, _ctx("chat"))
    capture("google-adk-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
