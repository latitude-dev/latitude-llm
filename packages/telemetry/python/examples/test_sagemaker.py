"""
Test AWS SageMaker instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_REGION
- SAGEMAKER_ENDPOINT_NAME (your deployed endpoint)

Install: uv add boto3
"""

import json
import os

import boto3

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Sagemaker],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_sagemaker_completion():
    client = boto3.client(
        "sagemaker-runtime",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )

    endpoint_name = os.environ["SAGEMAKER_ENDPOINT_NAME"]

    # Payload format depends on your deployed model
    payload = json.dumps({
        "inputs": "Say 'Hello from SageMaker!' in exactly 5 words.",
        "parameters": {
            "max_new_tokens": 50,
        },
    })

    response = client.invoke_endpoint(
        EndpointName=endpoint_name,
        ContentType="application/json",
        Body=payload,
    )

    result = json.loads(response["Body"].read().decode())
    return result[0]["generated_text"]


if __name__ == "__main__":
    print("Testing AWS SageMaker instrumentation...")
    print("Note: Requires a deployed SageMaker endpoint")
    result = test_sagemaker_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/sagemaker")
