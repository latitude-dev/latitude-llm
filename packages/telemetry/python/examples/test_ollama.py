"""
Test Ollama instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY

Requires Ollama running locally with a model pulled:
  ollama pull llama3.2

Install: uv add ollama
"""

import os

import ollama

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["ollama"],
    disable_batch=True,
)


@capture("test-ollama-completion", {"tags": ["test"], "session_id": "example"})
def test_ollama_completion():
    response = ollama.chat(
        model="llama3.2",
        messages=[{"role": "user", "content": "Say 'Hello from Ollama!' in exactly 5 words."}],
    )

    return response["message"]["content"]


if __name__ == "__main__":
    test_ollama_completion()
    latitude["flush"]()
