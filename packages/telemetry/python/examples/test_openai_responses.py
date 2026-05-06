"""
Test OpenAI Responses API instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai
"""

import os

from openai import OpenAI

from latitude_telemetry import capture, init_latitude

latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
    disable_batch=True,
)


@capture(
    "test-openai-responses",
    {
        "tags": ["python", "openai", "responses"],
        "session_id": "example",
        "user_id": "user_123",
        "metadata": {"test_type": "responses", "environment": "local"},
    },
)
def test_openai_responses():
    client = OpenAI()

    response = client.responses.create(
        model="gpt-4o-mini",
        input="Say 'Hello from OpenAI Responses!' in exactly 5 words.",
        max_output_tokens=50,
    )

    return response.output_text


@capture(
    "test-openai-responses-streaming",
    {
        "tags": ["python", "openai", "responses", "stream"],
        "session_id": "example",
        "user_id": "user_123",
        "metadata": {"test_type": "responses-stream", "environment": "local"},
    },
)
def test_openai_responses_streaming():
    client = OpenAI()

    stream = client.responses.create(
        model="gpt-4o-mini",
        input="Say 'Hello from OpenAI Responses stream!' in exactly 6 words.",
        max_output_tokens=50,
        stream=True,
    )

    chunks: list[str] = []
    for event in stream:
        # `event.type` is the discriminant of the streaming event union; comparing
        # it directly (rather than via `getattr`) lets pyright narrow `event` to
        # `ResponseTextDeltaEvent`, which carries the `delta: str` field.
        if event.type == "response.output_text.delta":
            chunks.append(event.delta)

    return "".join(chunks)


if __name__ == "__main__":
    test_openai_responses()
    test_openai_responses_streaming()
    latitude["flush"]()
