"""
Test AWS Bedrock instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION (default: us-east-1)

Install: uv add boto3
"""

import json
import os

import boto3

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Bedrock],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/bedrock",
)
def test_bedrock_completion():
    client = boto3.client(
        "bedrock-runtime",
        region_name=os.environ.get("AWS_REGION", "eu-central-1"),
    )

    # Using Amazon Nova on Bedrock via converse API
    # The converse API has better instrumentation support than invoke_model
    response = client.converse(
        modelId="nova-2-lite-v1:0",
        messages=[
            {"role": "user", "content": [{"text": "Say 'Hello from Bedrock!' in exactly 5 words."}]}
        ],
        inferenceConfig={
            "maxTokens": 50,
        },
    )

    return response["output"]["message"]["content"][0]["text"]


if __name__ == "__main__":
    print("Testing AWS Bedrock instrumentation...")
    result = test_bedrock_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/bedrock")
