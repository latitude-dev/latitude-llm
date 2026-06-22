"""
Replicate — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- REPLICATE_API_TOKEN

Install: uv add replicate
"""

import os
import uuid

import replicate

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"replicate": replicate},
    disable_batch=True,
)

PROVIDER = "replicate"
MODEL = "meta/meta-llama-3-8b-instruct"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    output = replicate.run(
        MODEL,
        input={
            "prompt": "Say 'Hello from Replicate!' in exactly 5 words.",
            "max_tokens": 50,
        },
    )

    # Replicate returns a generator, join the output
    return "".join(output)


if __name__ == "__main__":
    chat()

    capture("replicate-chat-capture", chat, _ctx("chat"))

    latitude.flush()
