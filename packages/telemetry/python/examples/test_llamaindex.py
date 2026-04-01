"""
Test LlamaIndex instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add llama-index llama-index-llms-openai
"""

import os

from llama_index.llms.openai import OpenAI

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.LlamaIndex],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_llamaindex_completion():
    llm = OpenAI(model="gpt-4o-mini", max_tokens=50)

    response = llm.complete("Say 'Hello from LlamaIndex!' in exactly 5 words.")

    return response.text


if __name__ == "__main__":
    print("Testing LlamaIndex instrumentation...")
    result = test_llamaindex_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/llamaindex")
