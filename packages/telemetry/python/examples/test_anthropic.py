"""
Test Anthropic instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- ANTHROPIC_API_KEY

Install: uv add anthropic
"""

import os

from anthropic import Anthropic

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Anthropic],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
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
    test_anthropic_completion()
    telemetry.flush()
