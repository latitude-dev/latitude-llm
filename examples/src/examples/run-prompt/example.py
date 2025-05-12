import asyncio
import os

from latitude_sdk import Latitude, LatitudeOptions, RunPromptOptions


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
        # Uncomment to use the local gateway
        # internal=InternalOptions(gateway=get_local_gateway()),
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
                # To get streaming you can use `on_event`
                # on_event=lambda event: print(event, "\n" * 2),
                # To get the final result you can use `on_finished`
                # on_finished=lambda result: print(result, "\n" * 2),
                on_error=lambda error: print(error, "\n" * 2),
                stream=True,
            ),
        )
    except Exception as e:
        print(f"Error: {e}")
        return

    if result:
        # Also you can wait for the result
        print(result.response.text, "\n" * 2)


asyncio.run(run())
