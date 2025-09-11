import asyncio
import os

from latitude_sdk import ApiError, FinishedResult, Latitude, LatitudeOptions, RunPromptOptions, StreamEvent


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
        "run-prompt/example",
        RunPromptOptions(
            parameters={
                "product_name": "iPhone",
                "features": "Camera, Battery, Display",
                "target_audience": "Tech enthusiasts",
                "tone": "Informal",
                "word_count": 20,
            },
            on_event=on_event,
            on_finished=on_finished,
            on_error=on_error,
            stream=True,
        ),
    )

    if result:
        print(result.response.text, "\n" * 2)


asyncio.run(run())
