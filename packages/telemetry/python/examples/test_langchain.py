"""
Test LangChain instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_ID
- OPENAI_API_KEY

Install: uv add langchain-core langchain-openai
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions, InternalOptions, GatewayOptions

# Initialize telemetry BEFORE importing langchain so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Langchain],
        disable_batch=True,
        internal=InternalOptions(
            gateway=GatewayOptions(base_url="http://localhost:8787"),
        ),
    ),
)

# Import after telemetry is initialized
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage


@telemetry.capture(
    project_id=int(os.environ["LATITUDE_PROJECT_ID"]),
    path="test/langchain",
)
def test_langchain_completion():
    llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=50)

    messages = [
        HumanMessage(content="Say 'Hello from LangChain!' in exactly 5 words.")
    ]

    response = llm.invoke(messages)

    return response.content


if __name__ == "__main__":
    print("Testing LangChain instrumentation...")
    result = test_langchain_completion()
    print(f"Response: {result}")
    print("Check Latitude dashboard for trace at path: test/langchain")
