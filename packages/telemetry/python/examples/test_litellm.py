"""
Test LiteLLM instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- OPENAI_API_KEY (or other provider keys depending on model)

Install: uv add litellm
"""

import os

import litellm

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.LiteLLM],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/litellm",
)
def test_litellm_completion():
    # LiteLLM can call any provider - using OpenAI here as example
    response = litellm.completion(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": "Say 'Hello from LiteLLM!' in exactly 5 words."}
        ],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    print("Testing LiteLLM instrumentation...")
    result = test_litellm_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/litellm")
