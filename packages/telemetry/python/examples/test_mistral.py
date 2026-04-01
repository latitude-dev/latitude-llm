"""
Test Mistral instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- MISTRAL_API_KEY

Install: uv add mistralai
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry BEFORE importing mistralai so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.MistralAI],
        disable_batch=True,
    ),
)

# Import after telemetry is initialized
from mistralai import Mistral


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_mistral_completion():
    from mistralai.models import UserMessage

    client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])

    response = client.chat.complete(
        model="mistral-small-latest",
        messages=[
            UserMessage(role="user", content="Say 'Hello from Mistral!' in exactly 5 words.")
        ],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    test_mistral_completion()
    telemetry.flush()
