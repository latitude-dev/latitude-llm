"""
Test Anthropic instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- ANTHROPIC_API_KEY

Install: uv add anthropic
"""

import os

from anthropic import Anthropic

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Anthropic],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/anthropic",
)
def test_anthropic_completion():
    client = Anthropic()

    response = client.messages.create(
        model="claude-3-5-haiku-latest",
        max_tokens=50,
        messages=[
            {"role": "user", "content": "Say 'Hello from Anthropic!' in exactly 5 words."}
        ],
    )

    return response.content[0].text


if __name__ == "__main__":
    print("Testing Anthropic instrumentation...")
    result = test_anthropic_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/anthropic")
