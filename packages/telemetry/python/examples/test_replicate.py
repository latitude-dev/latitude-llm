"""
Test Replicate instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- REPLICATE_API_TOKEN

Install: uv add replicate
"""

import os

import replicate

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Replicate],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/replicate",
)
def test_replicate_completion():
    output = replicate.run(
        "meta/meta-llama-3-8b-instruct",
        input={
            "prompt": "Say 'Hello from Replicate!' in exactly 5 words.",
            "max_tokens": 50,
        },
    )

    # Replicate returns a generator, join the output
    return "".join(output)


if __name__ == "__main__":
    print("Testing Replicate instrumentation...")
    result = test_replicate_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/replicate")
