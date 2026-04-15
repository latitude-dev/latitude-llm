"""
Test Together AI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- TOGETHER_API_KEY

Install: uv add together
"""

import os

from together import Together

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["together"],
    disable_batch=True,
)


@capture("test-together-completion", {"tags": ["test"], "session_id": "example"})
def test_together_completion():
    client = Together()

    response = client.chat.completions.create(
        model="meta-llama/Llama-3.2-3B-Instruct-Turbo",
        messages=[{"role": "user", "content": "Say 'Hello from Together!' in exactly 5 words."}],
        max_tokens=50,
    )

    return response.choices[0].message.content


if __name__ == "__main__":
    test_together_completion()
    latitude["flush"]()
