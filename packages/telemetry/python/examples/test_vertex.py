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

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.VertexAI],
        disable_batch=True,
    ),
)


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
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
    telemetry.flush()
