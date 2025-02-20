import asyncio
from dotenv import load_dotenv
import os
from typing import Any

from latitude_sdk import ChatPromptOptions, Latitude, LatitudeOptions, OnToolCallDetails, RunPromptOptions, InternalOptions, GatewayOptions
from promptl_ai import ImageContent, TextContent, UserMessage

from util.create_sdk import create_sdk

load_dotenv()

PROJECT_ID = os.getenv("PROJECT_ID")
COMMIT_UUID = os.getenv("COMMIT_UUID")
DOCUMENT_PATH = os.getenv("DOCUMENT_PATH")


async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails) -> str:
    # You could use a Pydantic model to validate the arguments and to have type hinting
    print(details)
    print(arguments["location"])

    # You can pause the execution of the tools if you need it, and resume the conversation
    # later, returning the tool results in the sdk.prompts.chat method
    # return details.pause_execution()

    return "20°C"

async def main():
    assert PROJECT_ID, "PROJECT_ID is not set"
    assert DOCUMENT_PATH, "DOCUMENT_PATH is not set"


    sdk = create_sdk(
        LatitudeOptions(
            project_id=int(PROJECT_ID),
            version_uuid=COMMIT_UUID
        )
    )
    result = await sdk.prompts.run(
        DOCUMENT_PATH,
        RunPromptOptions(
            parameters={
                "location": 'Boston',
            },
            tools={"get_the_weather": get_weather},
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda result: print(result, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )
    print(result)

    assert result is not None

    result = await sdk.prompts.chat(
        result.uuid,
        [
            UserMessage(content="Great!"),
            UserMessage(
                content=[
                    TextContent(text="Now, do it with this image!"),
                    ImageContent(image="https://placehold.co/600x400"),
                ]
            ),
        ],
        ChatPromptOptions(
            tools={"get_the_weather": get_weather},
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda result: print(result, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )
    print(result)


asyncio.run(main())
