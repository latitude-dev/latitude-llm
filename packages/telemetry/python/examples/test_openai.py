"""
Test OpenAI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add openai
"""

import os

from openai import OpenAI

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.OpenAI],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_openai_completion():
    client = OpenAI()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Hello from OpenAI!' in exactly 5 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_openai_streaming_completion():
    client = OpenAI()

    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": "Say 'Hello from OpenAI stream!' in exactly 6 words.",
            }
        ],
        max_tokens=50,
        stream=True,
        stream_options={"include_usage": True},
    )

    chunks: list[str] = []
    for chunk in stream:
        if len(chunk.choices) == 0:
            continue

        delta = chunk.choices[0].delta.content
        if delta is None:
            continue

        chunks.append(delta)

    return "".join(chunks)


if __name__ == "__main__":
    test_openai_completion()
    telemetry.flush()
