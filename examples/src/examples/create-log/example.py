import asyncio
import os
from devtools import pprint

from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    InternalOptions,
    CreateLogOptions,
)
from promptl_ai import AssistantMessage, UserMessage

from utils.python.get_local_gateway import get_local_gateway


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
        # Uncomment to use the local gateway internal=InternalOptions(gateway=get_local_gateway()),
        internal=InternalOptions(gateway=get_local_gateway()),
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
