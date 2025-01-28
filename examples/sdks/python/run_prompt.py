import asyncio
import os

from latitude_sdk import (
    ChatPromptOptions,
    ImageContent,
    Latitude,
    LatitudeOptions,
    OnToolCallDetails,
    RunPromptOptions,
    TextContent,
    ToolCall,
    ToolResult,
    UserMessage,
)

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")


async def get_weather(call: ToolCall, details: OnToolCallDetails) -> ToolResult:
    # You could use a Pydantic model to validate the arguments and have type hinting
    print(call.arguments["location"])

    # You can pause the execution of the tools if you need it, and resume the conversation
    # later, returning the tool results in the sdk.prompts.chat method
    # return details.pause_execution()

    return ToolResult(id=call.id, name=call.name, result="20°C", is_error=False)


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))

    result = await sdk.prompts.run(
        "prompt-path",
        RunPromptOptions(
            parameters={"topic": "Python"},
            tools={"get_weather": get_weather},
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda event: print(event, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )
    print(result)

    assert result is not None

    result = await sdk.prompts.chat(
        result.uuid,
        # You can also pass a list of dictionaries, but type hinting won't be available
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
            tools={"get_weather": get_weather},
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda event: print(event, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )
    print(result)


asyncio.run(main())
