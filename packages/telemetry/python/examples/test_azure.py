"""
Test Azure OpenAI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- AZURE_OPENAI_API_KEY
- AZURE_OPENAI_ENDPOINT

Install: uv add openai
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry BEFORE importing openai so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.OpenAI],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)

# Import after telemetry initialization
from openai import AzureOpenAI


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/azure-openai",
)
def test_azure_completion():
    client = AzureOpenAI(
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version="2024-02-01",
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    )

    # Replace with your deployment name
    deployment_name = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    response = client.chat.completions.create(
        model=deployment_name,
        messages=[
            {"role": "user", "content": "Say 'Hello from Azure!' in exactly 5 words."}
        ],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    print("Testing Azure OpenAI instrumentation...")
    result = test_azure_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/azure-openai")
