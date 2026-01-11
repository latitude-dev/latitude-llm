"""
Test IBM watsonx.ai instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- WATSONX_API_KEY
- WATSONX_PROJECT_ID
- WATSONX_URL (default: https://us-south.ml.cloud.ibm.com)

Install: uv add ibm-watsonx-ai
"""

import os

from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry pointing to local instance
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Watsonx],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/watsonx",
)
def test_watsonx_completion():
    model = Model(
        model_id="ibm/granite-13b-chat-v2",
        credentials={
            "url": os.environ.get("WATSONX_URL", "https://us-south.ml.cloud.ibm.com"),
            "apikey": os.environ["WATSONX_API_KEY"],
        },
        project_id=os.environ["WATSONX_PROJECT_ID"],
    )

    parameters = {
        GenParams.MAX_NEW_TOKENS: 50,
    }

    response = model.generate_text(
        prompt="Say 'Hello from watsonx!' in exactly 5 words.",
        params=parameters,
    )

    return response


if __name__ == "__main__":
    print("Testing IBM watsonx.ai instrumentation...")
    result = test_watsonx_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/watsonx")
