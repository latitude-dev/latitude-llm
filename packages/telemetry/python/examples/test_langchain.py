"""
Test LangChain instrumentation against local Latitude instance.

Required env vars:
- LATITUDE_API_KEY
- OPENAI_API_KEY

Install: uv add langchain-core langchain-openai
"""

import os

import langchain_core

from latitude_telemetry import Latitude, capture

# Initialize telemetry BEFORE importing langchain so instrumentation can patch it
latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"langchain": langchain_core},
    disable_batch=True,
)

# Import after telemetry is initialized
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI


@capture("test-langchain-completion", {"tags": ["python", "test"], "session_id": "example"})
def test_langchain_completion():
    llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=50)

    messages = [HumanMessage(content="Say 'Hello from LangChain!' in exactly 5 words.")]

    response = llm.invoke(messages)

    return response.content


if __name__ == "__main__":
    test_langchain_completion()
    latitude.flush()
