"""
Ollama — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG

Requires Ollama running locally with a model pulled:
  ollama pull llama3.2

Install: uv add ollama
"""

import os
import uuid

import ollama

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"ollama": ollama},
    disable_batch=True,
)

PROVIDER = "ollama"
MODEL = "llama3.2"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    response = ollama.chat(
        model=MODEL,
        messages=[{"role": "user", "content": "Say 'Hello from Ollama!' in exactly 5 words."}],
    )

    return response["message"]["content"]


if __name__ == "__main__":
    chat()

    capture("ollama-chat-capture", chat, _ctx("chat"))

    latitude.flush()
