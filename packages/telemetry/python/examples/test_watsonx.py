"""
Test IBM watsonx.ai instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- WATSONX_API_KEY
- WATSONX_PROJECT_ID
- WATSONX_URL (default: https://us-south.ml.cloud.ibm.com)

Install: uv add ibm-watsonx-ai
"""

import os

from ibm_watsonx_ai.foundation_models import Model
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

from latitude_telemetry import capture, init_latitude

# Initialize telemetry pointing to local instance
latitude = init_latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project_slug=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations=["watsonx"],
    disable_batch=True,
)


@capture("test-watsonx-completion", {"tags": ["test"], "session_id": "example"})
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
    test_watsonx_completion()
    latitude["flush"]()
