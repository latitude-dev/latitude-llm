"""
Test Aleph Alpha instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- ALEPH_ALPHA_API_KEY

Install: uv add aleph-alpha-client
"""

import os

from aleph_alpha_client import Client, CompletionRequest, Prompt

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.AlephAlpha],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/aleph-alpha",
)
def test_aleph_alpha_completion():
    client = Client(token=os.environ["ALEPH_ALPHA_API_KEY"])

    request = CompletionRequest(
        prompt=Prompt.from_text("Say 'Hello from Aleph Alpha!' in exactly 5 words:"),
        maximum_tokens=50,
    )

    response = client.complete(request, model="luminous-base")

    return response.completions[0].completion


if __name__ == "__main__":
    print("Testing Aleph Alpha instrumentation...")
    result = test_aleph_alpha_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/aleph-alpha")
