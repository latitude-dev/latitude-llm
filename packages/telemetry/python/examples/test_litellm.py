"""
Test LiteLLM instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY (or other provider keys depending on model)

Install: uv add litellm
"""

import os

import litellm

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["litellm"],
    disable_batch=True,
)


@capture("test-litellm-completion", {"tags": ["test"], "session_id": "example"})
def test_litellm_completion():
    # LiteLLM can call any provider - using OpenAI here as example
    response = litellm.completion(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Say 'Hello from LiteLLM!' in exactly 5 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    test_litellm_completion()
    latitude["flush"]()
