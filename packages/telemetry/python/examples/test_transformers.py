"""
Test Hugging Face Transformers instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY

Install: uv add transformers torch
"""

import os

from transformers import pipeline

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Transformers],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
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
