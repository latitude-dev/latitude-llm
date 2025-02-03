import asyncio
import os

from latitude_sdk import CreateLogOptions, Latitude, LatitudeOptions
from promptl_ai import AssistantMessage, UserMessage

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))

    result = await sdk.logs.create(
        "prompt-path",
        # You can also pass a list of dictionaries, but type hinting won't be available
        [
            UserMessage(content="Tell me a joke about Python!"),
            AssistantMessage(content="Python is a great language!"),
            UserMessage(content="Tell me a joke about JavaScript!"),
        ],
        CreateLogOptions(
            response="JavaScript is a great language too!",
        ),
    )
    print(result)


asyncio.run(main())
