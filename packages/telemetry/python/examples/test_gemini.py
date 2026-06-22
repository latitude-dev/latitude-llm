"""
Google Gemini (google-genai) — Latitude telemetry example.

Required env vars:
- LATITUDE_API_KEY
- LATITUDE_PROJECT_SLUG
- GEMINI_API_KEY

Install: uv add google-genai
"""

import os
import uuid

from google import genai
from google.genai import types

from latitude_telemetry import Latitude, capture

latitude = Latitude(
    api_key=os.environ["LATITUDE_API_KEY"],
    project=os.environ["LATITUDE_PROJECT_SLUG"],
    instrumentations={"google_generativeai": genai},
    disable_batch=True,
)

PROVIDER = "gemini"
MODEL = "gemini-2.5-flash"
SESSION_ID = f"{PROVIDER}-{uuid.uuid4().hex[:8]}"

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def _ctx(scenario: str, *extra_tags: str) -> dict:
    return {
        "tags": ["example", PROVIDER, *extra_tags],
        "session_id": SESSION_ID,
        "user_id": "example-user",
        "metadata": {"scenario": scenario, "environment": "local"},
    }


def chat() -> str | None:
    response = client.models.generate_content(
        model=MODEL,
        contents="Say 'Hello from Gemini!' in exactly 5 words.",
    )
    return response.text


def stream() -> str:
    chunks: list[str] = []
    for chunk in client.models.generate_content_stream(
        model=MODEL,
        contents="Say 'Hello from Gemini stream!' in exactly 6 words.",
    ):
        if chunk.text:
            chunks.append(chunk.text)
    return "".join(chunks)


def tool_conversation() -> str | None:
    weather_function = types.FunctionDeclaration(
        name="get_weather",
        description="Get the current weather for a city",
        parameters={
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    )
    config = types.GenerateContentConfig(tools=[types.Tool(function_declarations=[weather_function])])

    contents: list[types.Content] = [
        types.Content(
            role="user",
            parts=[
                types.Part(
                    text="What's the weather in San Francisco? Use get_weather, then answer in one short sentence."
                )
            ],
        )
    ]

    first = client.models.generate_content(model=MODEL, contents=contents, config=config)
    function_call = first.candidates[0].content.parts[0].function_call
    contents.append(first.candidates[0].content)
    contents.append(
        types.Content(
            role="user",
            parts=[
                types.Part.from_function_response(
                    name=function_call.name,
                    response={"city": "San Francisco", "temperatureC": 21, "conditions": "sunny"},
                )
            ],
        )
    )

    second = client.models.generate_content(model=MODEL, contents=contents, config=config)
    return second.text


if __name__ == "__main__":
    tool_conversation()

    capture("gemini-chat-capture", chat, _ctx("chat"))
    capture("gemini-stream-capture", stream, _ctx("stream", "stream"))
    capture("gemini-tools-capture", tool_conversation, _ctx("tools", "tools"))

    latitude.flush()
