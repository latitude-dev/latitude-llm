import asyncio
import os
from typing import Any

from devtools import pprint
from latitude_sdk import (
    ApiError,
    FinishedResult,
    Latitude,
    LatitudeOptions,
    OnToolCallDetails,
    RunPromptOptions,
    StreamEvent,
)


async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails) -> str:
    pprint(details)

    # Simulate a call to a weather API
    return "2°C"


async def on_event(event: StreamEvent):
    print(event, "\n" * 2)


async def on_finished(result: FinishedResult):
    print(result, "\n" * 2)


async def on_error(error: ApiError):
    print(error, "\n" * 2)


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )

    sdk = Latitude(api_key, sdk_options)
    result = await sdk.prompts.run(
        "run-prompt-with-tools/example",
        RunPromptOptions(
            parameters={
                "location": "Boston",
            },
            tools={"get_weather": get_weather},
            on_event=on_event,
            on_finished=on_finished,
            on_error=on_error,
            stream=True,
        ),
    )

    if result:
        print(result.response.text, "\n" * 2)


asyncio.run(run())
