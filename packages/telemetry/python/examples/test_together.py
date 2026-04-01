"""
Test Together AI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- TOGETHER_API_KEY

Install: uv add together
"""

import os

from together import Together

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Together],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_together_completion():
    client = Together()

    response = client.chat.completions.create(
        model="meta-llama/Llama-3.2-3B-Instruct-Turbo",
        messages=[
            {"role": "user", "content": "Say 'Hello from Together!' in exactly 5 words."}
        ],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    print("Testing Together AI instrumentation...")
    result = test_together_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/together")
