"""
Test LlamaIndex instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add llama-index llama-index-llms-openai
"""

import os

from llama_index.llms.openai import OpenAI

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["llamaindex"],
    disable_batch=True,
)


@capture("test-llamaindex-completion", {"tags": ["test"], "session_id": "example"})
def test_llamaindex_completion():
    llm = OpenAI(model="gpt-4o-mini", max_tokens=50)

    response = llm.complete("Say 'Hello from LlamaIndex!' in exactly 5 words.")

    return response.text


if __name__ == "__main__":
    test_llamaindex_completion()
    latitude["flush"]()
