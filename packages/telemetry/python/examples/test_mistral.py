"""
Mistral — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- MISTRAL_API_KEY

Install: uv add mistralai
"""

import os
import uuid

import mistralai
from mistralai import Mistral

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"mistralai": mistralai},
    disable_batch=True,
)

PROVIDER = "mistralai"
MODEL = "mistral-small-latest"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str | None:
    from mistralai.models import UserMessage

    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])

    response = client.chat.complete(
        model=MODEL,
        messages=[UserMessage(role="user", content="Say 'Hello from Mistral!' in exactly 5 words.")],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    chat()

    capture("mistralai-chat-capture", chat, _ctx("chat"))

    latitude.flush()
