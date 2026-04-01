"""
Test Haystack instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- OPENAI_API_KEY

Install: uv add haystack-ai
"""

import os

from haystack import Pipeline
from haystack.components.generators import OpenAIGenerator
from haystack.components.builders import PromptBuilder

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Haystack],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/haystack",
)
def test_haystack_completion():
    # Build a simple pipeline
    pipeline = Pipeline()

    prompt_template = "Answer the following: {{query}}"
    pipeline.add_component("prompt_builder", PromptBuilder(template=prompt_template))
    pipeline.add_component("llm", OpenAIGenerator(model="gpt-4o-mini"))
    pipeline.connect("prompt_builder", "llm")

    result = pipeline.run({
        "prompt_builder": {
            "query": "Say 'Hello from Haystack!' in exactly 5 words."
        }
    })

    return result["llm"]["replies"][0]


if __name__ == "__main__":
    print("Testing Haystack instrumentation...")
    result = test_haystack_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/haystack")
