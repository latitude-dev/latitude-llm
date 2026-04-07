"""
Test Haystack instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add haystack-ai
"""

import os

from haystack import Pipeline
from haystack.components.builders import PromptBuilder
from haystack.components.generators import OpenAIGenerator

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["haystack"],
    disable_batch=True,
)


@capture("test-haystack-completion", {"tags": ["test"], "session_id": "example"})
def test_haystack_completion():
    # Build a simple pipeline
    pipeline = Pipeline()

    prompt_template = "Answer the following: {{query}}"
    pipeline.add_component("prompt_builder", PromptBuilder(template=prompt_template))
    pipeline.add_component("llm", OpenAIGenerator(model="gpt-4o-mini"))
    pipeline.connect("prompt_builder", "llm")

    result = pipeline.run({"prompt_builder": {"query": "Say 'Hello from Haystack!' in exactly 5 words."}})

    return result["llm"]["replies"][0]


if __name__ == "__main__":
    test_haystack_completion()
    latitude["flush"]()
