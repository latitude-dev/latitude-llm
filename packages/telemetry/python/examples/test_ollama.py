"""
Test Ollama instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID

Requires Ollama running locally with a model pulled:
  ollama pull llama3.2

Install: uv add ollama
"""

import os

import ollama

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Ollama],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/ollama",
)
def test_ollama_completion():
    response = ollama.chat(
        model="llama3.2",
        messages=[
            {"role": "user", "content": "Say 'Hello from Ollama!' in exactly 5 words."}
        ],
    )

    return response["message"]["content"]


if __name__ == "__main__":
    print("Testing Ollama instrumentation...")
    print("Make sure Ollama is running locally with 'ollama serve'")
    result = test_ollama_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/ollama")
