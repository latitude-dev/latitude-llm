"""
Test Gemini instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- GEMINI_API_KEY

Install: uv add google-genai
"""

import os

from latitude_telemetry import capture, init_latitude

# Initialize telemetry BEFORE importing google.genai so instrumentation can patch it
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["google_generativeai"],
    disable_batch=True,
)

# Import after telemetry is initialized
from google import genai


@capture("test-gemini-completion", {"tags": ["test"], "session_id": "example"})
def test_gemini_completion():
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Say 'Hello from Gemini!' in exactly 5 words.",
    )

    return response.text


if __name__ == "__main__":
    test_gemini_completion()
    latitude["flush"]()
