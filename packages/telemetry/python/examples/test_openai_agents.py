"""
Test OpenAI Agents SDK instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai-agents
"""

import asyncio
import os

from agents import Agent, Runner, function_tool

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai-agents"],
    disable_batch=True,
)


@function_tool
def get_weather(city: str) -> str:
    """Returns the current weather for a city."""
    return f"The weather in {city} is sunny and 22°C."


def test_openai_agents_run():
    """Run a tool-using agent and capture the full hierarchy of agent/response/tool spans."""
    agent = Agent(
        name="Weather agent",
        instructions="Answer weather questions concisely. Always call get_weather first.",
        tools=[get_weather],
        model="gpt-4o-mini",
    )

    async def run_agent():
        result = await Runner.run(agent, "What's the weather in Barcelona?")
        return result.final_output

    return capture(
        "weather-agent-run",
        lambda: asyncio.run(run_agent()),
        {
            "tags": ["test", "openai-agents"],
            "session_id": "example",
            "user_id": "user_123",
            "metadata": {"test_type": "agent_run", "environment": "local"},
        },
    )


if __name__ == "__main__":
    output = test_openai_agents_run()
    print(f"Final output: {output}")
    latitude["flush"]()
