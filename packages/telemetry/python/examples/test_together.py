"""
Test Together AI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- TOGETHER_API_KEY

Install: uv add together
"""

import os

from together import Together

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Together],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/together",
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
