"""
Test Haystack instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add haystack-ai
"""

import os

from haystack import Pipeline
from haystack.components.generators import OpenAIGenerator
from haystack.components.builders import PromptBuilder

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Haystack],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
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
    test_haystack_completion()
    telemetry.flush()
