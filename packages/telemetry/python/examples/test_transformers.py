"""
Hugging Face Transformers — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG

Install: uv add transformers torch
"""

import os
import uuid

import transformers
from transformers import pipeline

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"transformers": transformers},
    disable_batch=True,
)

PROVIDER = "transformers"
MODEL = "gpt2"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    generator = pipeline(
        "text-generation",
        model=MODEL,
        max_new_tokens=50,
    )

    result = generator("Say 'Hello from Transformers!' in exactly 5 words:")

    return result[0]["generated_text"]


if __name__ == "__main__":
    chat()

    capture("transformers-chat-capture", chat, _ctx("chat"))

    latitude.flush()
