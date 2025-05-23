import asyncio
import os

from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    GetOrCreatePromptOptions,
)


PROMPT = """
Answer succinctly yet complete.
<user>
  Tell me a joke about a {{topic}}
</user>
"""


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        # YOU CAN NOT CREATE A PROMPT in A LIVE Version
        # version_uuid='live',
        # More info: https://docs.latitude.so/guides/prompt-manager/version-control
        version_uuid="[CREATE_A_NEW_VERSION_UUID]",
        # Uncomment to use the local gateway
        # internal=InternalOptions(gateway=get_local_gateway()),
    )

    sdk = Latitude(api_key, sdk_options)

    result = await sdk.prompts.get_or_create(
        "create-propmpt/example",
        GetOrCreatePromptOptions(prompt=PROMPT),
    )
    print(result, "\n" * 2)


asyncio.run(run())
