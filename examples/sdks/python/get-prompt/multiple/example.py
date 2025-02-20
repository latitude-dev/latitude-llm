import asyncio
import os
from dotenv import load_dotenv

from latitude_sdk import GetAllPromptOptions, GetPromptOptions, LatitudeOptions

from util.create_sdk import create_sdk

load_dotenv()

PROJECT_ID = os.getenv("PROJECT_ID")
VERSION_UUID = os.getenv("VERSION_UUID")


async def main():
    assert PROJECT_ID, "PROJECT_ID is not set"

    sdk = create_sdk()

    # Latest version
    prompt = await sdk.prompts.get_all(GetAllPromptOptions(project_id=int(PROJECT_ID)))
    print(prompt)

    # Specific version
    prompt = await sdk.prompts.get_all(GetAllPromptOptions(project_id=int(PROJECT_ID), version_uuid=VERSION_UUID))
    print(prompt)


asyncio.run(main())
