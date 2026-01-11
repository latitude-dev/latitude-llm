"""
Test Vertex AI instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON)
- GOOGLE_CLOUD_PROJECT

Install: uv add google-cloud-aiplatform
"""

import os

import vertexai
from vertexai.generative_models import GenerativeModel

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.VertexAI],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/vertex",
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
    print("Testing Vertex AI instrumentation...")
    result = test_vertex_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/vertex")
