import asyncio
import os

from latitude_sdk import Latitude, LatitudeOptions

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
        result = await sdk.prompts.get("get-prompt/example")
    except Exception as e:
        print(f"Error: {e}")
        return

    if result:
        # Also you can wait for the result
        print(result, "\n" * 2)


asyncio.run(run())
