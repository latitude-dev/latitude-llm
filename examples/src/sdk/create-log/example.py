import asyncio
import os
from devtools import pprint

from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    CreateLogOptions,
)
from promptl_ai import AssistantMessage, UserMessage


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)
    result = await sdk.logs.create(
        "create-log/example",
        [
            UserMessage(content="Tell me a joke about Python!"),
            AssistantMessage(content="Python is a great language!"),
            UserMessage(content="Tell me a joke about JavaScript!"),
        ],
        CreateLogOptions(
            response="JavaScript is a great language too!",
        ),
    )

    pprint(result)


asyncio.run(run())
