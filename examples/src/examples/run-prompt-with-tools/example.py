import asyncio
import os
from devtools import pprint

from typing import Any

from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
    ChatPromptOptions,
    OnToolCallDetails,
)


async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails) -> str:
    pprint(details)

    # You can pause the execution of the tools if you need it, and resume the conversation
    # later, returning the tool results in the sdk.prompts.chat method
    # return details.pause_execution()

    return "2°C"


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
        # Uncomment to use the local gateway
        # internal=InternalOptions(gateway=get_local_gateway()),
    )

    sdk = Latitude(api_key, sdk_options)
    result = await sdk.prompts.run(
        "run-prompt-with-tools/example",
        RunPromptOptions(
            parameters={
                "location": "Boston",
            },
            tools={"get_weather": get_weather},
            # on_event=lambda event: print(event, "\n" * 2),
            # on_finished=lambda result: print(result, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )

    print(f"Response UUID: {result.uuid} \n")

    # When the AI ask for the tool we response to it using `chat` method from the sdk
    # You need the `uuid` of the result to use it
    result = await sdk.prompts.chat(
        result.uuid,
        [],  # List of extra messages
        ChatPromptOptions(
            tools={"get_weather": get_weather},
            # on_event=lambda event: print(event, "\n" * 2),
            # on_finished=lambda result: print(result, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )

    last_message = result.conversation[-1]
    text_message = last_message.content[0].text
    print(text_message, "\n" * 2)


asyncio.run(run())
