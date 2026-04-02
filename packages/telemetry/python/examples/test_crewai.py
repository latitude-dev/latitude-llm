"""
Test CrewAI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY (CrewAI uses OpenAI by default)

Install: uv add crewai
"""

import os

from crewai import Agent, Crew, Task

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
# Note: CrewAI uses OpenAI by default, so we instrument both
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["crewai", "openai"],
    disable_batch=True,
)


@capture("test-crewai-crew", {"tags": ["test"], "session_id": "example"})
def test_crewai_crew():
    researcher = Agent(
        role="Researcher",
        goal="Research and summarize topics concisely",
        backstory="You are a skilled researcher who provides brief, accurate summaries.",
        verbose=False,
    )

    task = Task(
        description="Explain what OpenTelemetry is in exactly one sentence.",
        expected_output="A single sentence explanation of OpenTelemetry.",
        agent=researcher,
    )

    crew = Crew(
        agents=[researcher],
        tasks=[task],
        verbose=False,
    )

    result = crew.kickoff()
    return result.raw


if __name__ == "__main__":
    test_crewai_crew()
    latitude["flush"]()
