"""
Test Gemini instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- GEMINI_API_KEY

Install: uv add google-generativeai
"""

import os

import google.generativeai as genai

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.GoogleGenerativeAI],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/gemini",
)
def test_gemini_completion():
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content("Say 'Hello from Gemini!' in exactly 5 words.")

    return response.text


if __name__ == "__main__":
    print("Testing Gemini instrumentation...")
    result = test_gemini_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/gemini")
