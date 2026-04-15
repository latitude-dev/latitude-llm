"""
Test OpenAI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add openai
"""

import os

from openai import OpenAI

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["openai"],
    disable_batch=True,
)


@capture(
    "test-openai-completion",
    {
        "tags": ["test"],
        "session_id": "example",
        "user_id": "user_123",
        "metadata": {"test_type": "completion", "environment": "local"},
    },
)
def test_openai_completion():
    client = OpenAI()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Hello from OpenAI!' in exactly 5 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


@capture(
    "test-openai-streaming",
    {
        "tags": ["test"],
        "session_id": "example",
        "user_id": "user_123",
        "metadata": {"test_type": "streaming", "environment": "local"},
    },
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


def test_openai_completion_callback():
    """Test using callback-based capture API (functional pattern)."""
    client = OpenAI()

    def make_completion():
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Say 'Hello from callback API!' in exactly 5 words."}],
            max_tokens=50,
        )
        return response.choices[0].message.content

    return capture(
        "test-openai-callback",
        make_completion,
        {
            "tags": ["callback-test"],
            "session_id": "callback-example",
            "user_id": "user_callback",
            "metadata": {"test_type": "callback", "environment": "local"},
        },
    )


if __name__ == "__main__":
    test_openai_completion()
    test_openai_streaming_completion()
    test_openai_completion_callback()
    latitude["flush"]()
