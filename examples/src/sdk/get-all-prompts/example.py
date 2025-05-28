import asyncio
import os

from latitude_sdk import Latitude, LatitudeOptions


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)
    results = await sdk.prompts.get_all()

    # You can pass different project_id or version_uuid
    # results = await sdk.prompts.get_all(
    #    GetAllPromptOptions(
    #       project_id=123,
    #       version_uuid=VERSION_UUID
    #    )

    paths = [result.path for result in results]

    print(paths, "\n" * 2)


asyncio.run(run())
