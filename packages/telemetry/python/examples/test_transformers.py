"""
Test Hugging Face Transformers instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID

Install: uv add transformers torch
"""

import os

from transformers import pipeline

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Transformers],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/transformers",
)
def test_transformers_completion():
    # Using a small model for testing
    generator = pipeline(
        "text-generation",
        model="gpt2",
        max_new_tokens=50,
    )

    result = generator("Say 'Hello from Transformers!' in exactly 5 words:")

    return result[0]["generated_text"]


if __name__ == "__main__":
    print("Testing Hugging Face Transformers instrumentation...")
    print("Note: This will download the model on first run")
    result = test_transformers_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/transformers")
