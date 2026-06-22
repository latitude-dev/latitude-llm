"""
AWS SageMaker — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- SAGEMAKER_ENDPOINT_NAME (your deployed endpoint)

Install: uv add boto3
"""

import json
import os
import uuid

import boto3

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"sagemaker": boto3},
    disable_batch=True,
)

PROVIDER = "sagemaker"
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
        "sagemaker-runtime",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )

    endpoint_name = os.environ["SAGEMAKER_ENDPOINT_NAME"]

    # Payload format depends on your deployed model
    payload = json.dumps(
        {
            "inputs": "Say 'Hello from SageMaker!' in exactly 5 words.",
            "parameters": {
                "max_new_tokens": 50,
            },
        }
    )

    response = client.invoke_endpoint(
        EndpointName=endpoint_name,
        ContentType="application/json",
        Body=payload,
    )

    result = json.loads(response["Body"].read().decode())
    return result[0]["generated_text"]


if __name__ == "__main__":
    chat()

    capture("sagemaker-chat-capture", chat, _ctx("chat"))

    latitude.flush()
