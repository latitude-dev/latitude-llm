"""
Test Replicate instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- REPLICATE_API_TOKEN

Install: uv add replicate
"""

import os

import replicate

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["replicate"],
    disable_batch=True,
)


@capture("test-replicate-completion", {"tags": ["test"], "session_id": "example"})
def test_replicate_completion():
    output = replicate.run(
        "meta/meta-llama-3-8b-instruct",
        input={
            "prompt": "Say 'Hello from Replicate!' in exactly 5 words.",
            "max_tokens": 50,
        },
    )

    # Replicate returns a generator, join the output
    return "".join(output)


if __name__ == "__main__":
    test_replicate_completion()
    latitude["flush"]()
