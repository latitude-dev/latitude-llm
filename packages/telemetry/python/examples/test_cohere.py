"""
Test Cohere instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- COHERE_API_KEY

Install: uv add cohere
"""

import os

import cohere

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Cohere],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
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
