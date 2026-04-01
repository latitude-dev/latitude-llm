"""
Test Groq instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- GROQ_API_KEY

Install: uv add groq
"""

import os

from groq import Groq

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["groq"],
    disable_batch=True,
)


@capture("test-groq-completion", {"tags": ["test"], "session_id": "example"})
def test_groq_completion():
    client = Groq()

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": "Say 'Hello from Groq!' in exactly 5 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    test_groq_completion()
    latitude["flush"]()
