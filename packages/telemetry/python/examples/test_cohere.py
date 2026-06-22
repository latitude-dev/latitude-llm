"""
Cohere — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- COHERE_API_KEY

Install: uv add cohere
"""

import os
import uuid

import cohere

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"cohere": cohere},
    disable_batch=True,
)

PROVIDER = "cohere"
MODEL = "command-a-03-2025"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    client = cohere.Client(api_key=os.environ["COHERE_API_KEY"])

    response = client.chat(
        model=MODEL,
        message="Say 'Hello from Cohere!' in exactly 5 words.",
        max_tokens=50,
    )

    return response.text


if __name__ == "__main__":
    chat()

    capture("cohere-chat-capture", chat, _ctx("chat"))

    latitude.flush()
