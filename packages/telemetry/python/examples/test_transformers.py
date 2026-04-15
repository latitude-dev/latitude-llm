"""
Test Hugging Face Transformers instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY

Install: uv add transformers torch
"""

import os

from transformers import pipeline

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["transformers"],
    disable_batch=True,
)


@capture("test-transformers-completion", {"tags": ["test"], "session_id": "example"})
def test_transformers_completion():
    # Using a small model for testing
    generator = pipeline(
        "text-generation",
        model="gpt2",
        max_new_tokens=50,
    )

    result = generator("Say 'Hello from Transformers!' in exactly 5 words:")

    return result[0]["generated_text"]


if __name__ == "__main__":
    test_transformers_completion()
    latitude["flush"]()
