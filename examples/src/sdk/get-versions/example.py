import asyncio
import os

from latitude_sdk import Latitude, LatitudeOptions, GetAllVersionsOptions


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)
    results = await sdk.versions.get_all()

    # You can pass different project_id
    # results = await sdk.versions.get_all(
    #    GetAllVersionsOptions(
    #       project_id=123,
    #    )

    versions_info = [
        {
            "uuid": result.uuid,
            "title": result.title,
            "created_at": result.created_at,
        }
        for result in results
    ]

    print(versions_info, "\n" * 2)


asyncio.run(run())