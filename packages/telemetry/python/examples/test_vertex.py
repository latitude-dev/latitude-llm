"""
Test Vertex AI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
- GOOGLE_CLOUD_PROJECT

Install: uv add google-cloud-aiplatform
"""

import os

import vertexai
from vertexai.generative_models import GenerativeModel

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["vertexai"],
    disable_batch=True,
)


@capture("test-vertex-completion", {"tags": ["test"], "session_id": "example"})
def test_vertex_completion():
    # Initialize Vertex AI
    vertexai.init(
        project=os.environ["GOOGLE_CLOUD_PROJECT"],
        location="us-central1",
    )

    model = GenerativeModel("gemini-2.5-flash")
    response = model.generate_content("Say 'Hello from Vertex!' in exactly 5 words.")

    return response.text


if __name__ == "__main__":
    test_vertex_completion()
    latitude["flush"]()
