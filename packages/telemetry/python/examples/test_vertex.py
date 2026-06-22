"""
Vertex AI — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
- GOOGLE_CLOUD_PROJECT

Install: uv add google-cloud-aiplatform
"""

import os
import uuid

import vertexai
from vertexai.generative_models import GenerativeModel

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"vertexai": vertexai},
    disable_batch=True,
)

PROVIDER = "vertexai"
MODEL = "gemini-2.5-flash"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    vertexai.init(
        project=os.environ["GOOGLE_CLOUD_PROJECT"],
        location="us-central1",
    )

    model = GenerativeModel(MODEL)
    response = model.generate_content("Say 'Hello from Vertex!' in exactly 5 words.")

    return response.text


if __name__ == "__main__":
    chat()

    capture("vertexai-chat-capture", chat, _ctx("chat"))

    latitude.flush()
