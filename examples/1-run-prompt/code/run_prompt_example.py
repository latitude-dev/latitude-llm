import asyncio
import os

from latitude_sdk import ChatPromptOptions, Latitude, LatitudeOptions, OnToolCallDetails, RunPromptOptions, InternalOptions, GatewayOptions
from promptl_ai import ImageContent, TextContent, UserMessage

PROJECT_ID = os.getenv("PROJECT_ID")
COMMIT_UUID = os.getenv("COMMIT_UUID")
DOCUMENT_PATH = os.getenv("DOCUMENT_PATH")

print("PROJECT_ID", PROJECT_ID)

from util.create_sdk import create_sdk


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
        "run-prompt",
        RunPromptOptions(
            parameters={
                product_name: "iPhone",
                features: "Camera, Battery, Display",
                target_audience: "Tech enthusiasts",
                tone: "Informal",
                word_count: 20,
            },
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda result: print(result, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )
    print(result)


asyncio.run(main())
