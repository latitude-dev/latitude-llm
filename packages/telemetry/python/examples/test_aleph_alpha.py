"""
Test Aleph Alpha instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- ALEPH_ALPHA_API_KEY

Install: uv add aleph-alpha-client
"""

import os

from aleph_alpha_client import Client, CompletionRequest, Prompt

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["aleph_alpha"],
    disable_batch=True,
)


@capture("test-aleph-alpha-completion", {"tags": ["test"], "session_id": "example"})
def test_aleph_alpha_completion():
    client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])

    request = CompletionRequest(
        prompt=Prompt.from_text("Say 'Hello from Aleph Alpha!' in exactly 5 words:"),
        maximum_tokens=50,
    )

    response = client.complete(request, model="luminous-base")

    return response.completions[0].completion


if __name__ == "__main__":
    test_aleph_alpha_completion()
    latitude["flush"]()
