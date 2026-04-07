"""
Test Cohere instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- COHERE_API_KEY

Install: uv add cohere
"""

import os

import cohere

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["cohere"],
    disable_batch=True,
)


@capture("test-cohere-completion", {"tags": ["test"], "session_id": "example"})
def test_cohere_completion():
    client = cohere.Client(api_key=os.environ["COHERE_API_KEY"])

    response = client.chat(
        model="command-a-03-2025",
        message="Say 'Hello from Cohere!' in exactly 5 words.",
        max_tokens=50,
    )

    return response.text


if __name__ == "__main__":
    test_cohere_completion()
    latitude["flush"]()
