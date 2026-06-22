"""
AWS Bedrock — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION (default: us-east-1)

Install: uv add boto3
"""

import os
import uuid

import boto3

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"bedrock": boto3},
    disable_batch=True,
)

PROVIDER = "bedrock"
MODEL = "nova-2-lite-v1:0"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str:
    client = boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get("AWS_REGION", "eu-central-1"),
    )

    # The converse API has better instrumentation support than invoke_model.
    response = client.converse(
        modelId=MODEL,
        messages=[{"role": "user", "content": [{"text": "Say 'Hello from Bedrock!' in exactly 5 words."}]}],
        inferenceConfig={
            "maxTokens": 50,
        },
    )

    return response["output"]["message"]["content"][0]["text"]


if __name__ == "__main__":
    chat()

    capture("bedrock-chat-capture", chat, _ctx("chat"))

    latitude.flush()
