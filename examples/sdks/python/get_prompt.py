import asyncio
import os

from latitude_sdk import GetPromptOptions, Latitude, LatitudeOptions

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))

    # Latest version
    prompt = await sdk.prompts.get("prompt-path", GetPromptOptions())
    print(prompt)

    # Specific version
    prompt = await sdk.prompts.get("prompt-path", GetPromptOptions(version_uuid="prompt-version-uuid"))
    print(prompt)


asyncio.run(main())
