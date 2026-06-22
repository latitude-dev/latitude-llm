"""
Aleph Alpha — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- ALEPH_ALPHA_API_KEY

Install: uv add aleph-alpha-client
"""

import os
import uuid

import aleph_alpha_client
from aleph_alpha_client import Client, CompletionRequest, Prompt

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"aleph_alpha": aleph_alpha_client},
    disable_batch=True,
)

PROVIDER = "aleph-alpha"
MODEL = "luminous-base"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])

    request = CompletionRequest(
        prompt=Prompt.from_text("Say 'Hello from Aleph Alpha!' in exactly 5 words:"),
        maximum_tokens=50,
    )

    response = client.complete(request, model=MODEL)

    return response.completions[0].completion


if __name__ == "__main__":
    chat()

    capture("aleph-alpha-chat-capture", chat, _ctx("chat"))

    latitude.flush()
