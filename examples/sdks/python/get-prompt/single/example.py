import asyncio
import os
from dotenv import load_dotenv

from latitude_sdk import GetPromptOptions, LatitudeOptions

from util.create_sdk import create_sdk

load_dotenv()

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
PROJECT_ID = os.getenv("PROJECT_ID")
DOCUMENT_PATH = os.getenv("DOCUMENT_PATH")
VERSION_UUID = os.getenv("VERSION_UUID")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert PROJECT_ID, "PROJECT_ID is not set"
    assert DOCUMENT_PATH, "DOCUMENT_PATH is not set"

    sdk = create_sdk(
        LatitudeOptions(
            project_id=int(PROJECT_ID),
            version_uuid=VERSION_UUID
        )
    )

    # Latest version
    prompt = await sdk.prompts.get(DOCUMENT_PATH)
    print(prompt)

    # Specific version
    prompt = await sdk.prompts.get(DOCUMENT_PATH, GetPromptOptions(version_uuid=VERSION_UUID))
    print(prompt)


asyncio.run(main())
