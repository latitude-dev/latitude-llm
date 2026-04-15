"""
Test Anthropic instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- ANTHROPIC_API_KEY

Install: uv add anthropic
"""

import os

from anthropic import Anthropic

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["anthropic"],
    disable_batch=True,
)


@capture("test-anthropic-completion", {"tags": ["test"], "session_id": "example"})
def test_anthropic_completion():
    client = Anthropic()

    response = client.messages.create(
        model="claude-3-5-haiku-latest",
        max_tokens=50,
        messages=[{"role": "user", "content": "Say 'Hello from Anthropic!' in exactly 5 words."}],
    )

    return response.content[0].text


if __name__ == "__main__":
    test_anthropic_completion()
    latitude["flush"]()
