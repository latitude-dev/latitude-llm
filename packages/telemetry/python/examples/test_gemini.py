"""
Test Gemini instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- GEMINI_API_KEY

Install: uv add google-genai
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry BEFORE importing google.genai so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.GoogleGenerativeAI],
        disable_batch=True,
    ),
)

# Import after telemetry is initialized
from google import genai


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_gemini_completion():
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Say 'Hello from Gemini!' in exactly 5 words.",
    )

    return response.text


if __name__ == "__main__":
    print("Testing Gemini instrumentation...")
    result = test_gemini_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/gemini")
