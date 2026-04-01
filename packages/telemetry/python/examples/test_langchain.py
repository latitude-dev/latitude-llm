"""
Test LangChain instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add langchain-core langchain-openai
"""

import os

from latitude_telemetry import Telemetry, Instrumentors, TelemetryOptions

# Initialize telemetry BEFORE importing langchain so instrumentation can patch it
telemetry = Telemetry(
    os.environ["LATITUDE_API_KEY"],
    os.environ["LATITUDE_PROJECT_SLUG"],
    TelemetryOptions(
        instrumentors=[Instrumentors.Langchain],
        disable_batch=True,
    ),
)

# Import after telemetry is initialized
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage


@telemetry.capture(
    tags=["test"],
    session_id="example",
)
def test_langchain_completion():
    llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=50)

    messages = [
        HumanMessage(content="Say 'Hello from LangChain!' in exactly 5 words.")
    ]

    response = llm.invoke(messages)

    return response.content


if __name__ == "__main__":
    test_langchain_completion()
    telemetry.flush()
