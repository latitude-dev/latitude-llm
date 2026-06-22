"""
DSPy — Latitude telemetry example. DSPy has no dedicated instrumentation; it runs
every LM call through litellm, so we instrument litellm.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- OPENAI_API_KEY

Install: uv add dspy
"""

import json
import os
import uuid

import dspy
import litellm

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"litellm": litellm},
    disable_batch=True,
)

PROVIDER = "dspy"
MODEL = "openai/gpt-4o-mini"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"

# cache=False so repeated runs actually hit litellm (cached calls record no usage).
dspy.configure(lm=dspy.LM(MODEL, cache=False))


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def get_weather(city: str) -> str:
    """Get the current weather for a city."""
    return json.dumps({"city": city, "temperatureC": 21, "conditions": "sunny"})


def chat() -> str:
    qa = dspy.Predict("question -> answer")
    return qa(question="Say 'Hello from DSPy!' in exactly 5 words.").answer


def tool_conversation() -> str:
    react = dspy.ReAct("question -> answer", tools=[get_weather])
    result = react(question="What's the weather in San Francisco? Use get_weather, then answer in one short sentence.")
    return result.answer


if __name__ == "__main__":
    tool_conversation()

    capture("dspy-chat-capture", chat, _ctx("chat"))
    capture("dspy-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
