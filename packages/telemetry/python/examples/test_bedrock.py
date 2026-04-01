"""
Test AWS Bedrock instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION (default: us-east-1)

Install: uv add boto3
"""

import json
import os

import boto3

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["bedrock"],
    disable_batch=True,
)


@capture("test-bedrock-completion", {"tags": ["test"], "session_id": "example"})
def test_bedrock_completion():
    client = boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get("AWS_REGION", "eu-central-1"),
    )

    # Using Amazon Nova on Bedrock via converse API
    # The converse API has better instrumentation support than invoke_model
    response = client.converse(
        modelId="nova-2-lite-v1:0",
        messages=[{"role": "user", "content": [{"text": "Say 'Hello from Bedrock!' in exactly 5 words."}]}],
        inferenceConfig={
            "maxTokens": 50,
        },
    )

    return response["output"]["message"]["content"][0]["text"]


if __name__ == "__main__":
    test_bedrock_completion()
    latitude["flush"]()
