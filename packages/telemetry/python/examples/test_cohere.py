"""
Test Cohere instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- COHERE_API_KEY

Install: uv add cohere
"""

import os

import cohere

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Cohere],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/cohere",
)
def test_cohere_completion():
    client = cohere.Client(api_key=os.environ["COHERE_API_KEY"])

    response = client.chat(
        model="command-a-03-2025",
        message="Say 'Hello from Cohere!' in exactly 5 words.",
        max_tokens=50,
    )

    return response.text


if __name__ == "__main__":
    print("Testing Cohere instrumentation...")
    result = test_cohere_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/cohere")
