"""
Test Google ADK (Agent Development Kit) instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- GOOGLE_API_KEY (Gemini API key from Google AI Studio)

Install: uv add google-adk
"""

import asyncio
import os

import google.adk
from google.adk.agents import Agent
from google.adk.runners import InMemoryRunner
from google.genai import types

from latitude_telemetry import Latitude, capture

# Initialize telemetry pointing to local instance
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"google_adk": google.adk},
    disable_batch=True,
)


def get_weather(city: str) -> dict:
    """Returns the current weather for a city."""
    return {"status": "success", "report": f"The weather in {city} is sunny and 22°C."}


agent = Agent(
    name="weather_agent",
    model="gemini-2.5-flash",
    description="Agent that answers weather questions using tools.",
    instruction="Answer weather questions concisely. Always call get_weather first.",
    tools=[get_weather],
)


def test_google_adk_run():
    """Run a tool-using ADK agent and capture the full agent/model/tool span hierarchy."""
    app_name = "weather_app"
    user_id = "user_123"
    session_id = "example"

    async def run_agent():
        runner = InMemoryRunner(agent=agent, app_name=app_name)
        await runner.session_service.create_session(
            app_name=app_name,
            user_id=user_id,
            session_id=session_id,
        )

        final_output = ""
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=types.Content(
                role="user",
                parts=[types.Part(text="What's the weather in Barcelona?")],
            ),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                text = event.content.parts[0].text
                if text:
                    final_output = text.strip()
        return final_output

    return capture(
        "weather-agent-run",
        lambda: asyncio.run(run_agent()),
        {
            "tags": ["python", "test", "google-adk"],
            "session_id": "example",
            "user_id": "user_123",
            "metadata": {"test_type": "agent_run", "environment": "local"},
        },
    )


if __name__ == "__main__":
    output = test_google_adk_run()
    print(f"Final output: {output}")
    latitude.flush()
