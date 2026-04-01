"""
Test Groq instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- GROQ_API_KEY

Install: uv add groq
"""

import os

from groq import Groq

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Groq],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_groq_completion():
    client = Groq()

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "user", "content": "Say 'Hello from Groq!' in exactly 5 words."}
        ],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    print("Testing Groq instrumentation...")
    result = test_groq_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/groq")
