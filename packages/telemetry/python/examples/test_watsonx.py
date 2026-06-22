"""
IBM watsonx.ai — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- WATSONX_API_KEY
- WATSONX_PROJECT_ID
- WATSONX_URL (default: https://us-south.ml.cloud.ibm.com)

Install: uv add ibm-watsonx-ai
"""

import os
import uuid

import ibm_watsonx_ai
from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"watsonx": ibm_watsonx_ai},
    disable_batch=True,
)

PROVIDER = "watsonx"
MODEL = "ibm/granite-13b-chat-v2"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    model = Model(
        model_id=MODEL,
        credentials={
            "url": os.environ.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
            "apikey": os.environ["WATSONX_API_KEY"],
        },
        project_id=os.environ["WATSONX_PROJECT_ID"],
    )

    parameters = {
        GenParams.MAX_NEW_TOKENS: 50,
    }

    response = model.generate_text(
        prompt="Say 'Hello from watsonx!' in exactly 5 words.",
        params=parameters,
    )

    return response


if __name__ == "__main__":
    chat()

    capture("watsonx-chat-capture", chat, _ctx("chat"))

    latitude.flush()
