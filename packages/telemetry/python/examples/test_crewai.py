"""
Test CrewAI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- OPENAI_API_KEY (CrewAI uses OpenAI by default)

Install: uv add crewai
"""

import os

from crewai import Agent, Task, Crew

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
# Note: CrewAI uses OpenAI by default, so we instrument both
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.CrewAI, Instrumentors.OpenAI],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/crewai",
)
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
    print("Testing CrewAI instrumentation...")
    result = test_crewai_crew()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/crewai")
