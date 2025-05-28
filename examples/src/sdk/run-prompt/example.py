import asyncio
import os

from latitude_sdk import Latitude, LatitudeOptions, RunPromptOptions


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)
    try:
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
                on_error=lambda error: print(error, "\n" * 2),
                stream=True,
            ),
        )
    except Exception as e:
        print(f"Error: {e}")
        return

    if result:
        print(result.response.text, "\n" * 2)


asyncio.run(run())
