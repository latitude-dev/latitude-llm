import asyncio
import os

from latitude_sdk import (
    ChatPromptOptions,
    CreateEvaluationResultOptions,
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
    TriggerEvaluationOptions,
    UserMessage,
)

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"

    sdk = Latitude(api_key=LATITUDE_API_KEY, options=LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))

    result = await sdk.prompts.run(
        "prompt-path",
        RunPromptOptions(
            parameters={"topic": "Python"},
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda event: print(event, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )

    assert result is not None

    chat_result = await sdk.prompts.chat(
        result.uuid,
        [UserMessage(content="Tell me another joke!")],
        ChatPromptOptions(
            on_event=lambda event: print(event, "\n" * 2),
            on_finished=lambda event: print(event, "\n" * 2),
            on_error=lambda error: print(error, "\n" * 2),
            stream=True,
        ),
    )

    assert chat_result is not None

    # Trigger all LLM as judge evaluations for this chat
    result = await sdk.evaluations.trigger(
        chat_result.uuid,
        TriggerEvaluationOptions(
            evaluation_uuids=[],
        ),
    )
    print(result)

    # Trigger an specific LLM as judge evaluation for this chat
    result = await sdk.evaluations.trigger(
        chat_result.uuid,
        TriggerEvaluationOptions(
            evaluation_uuids=["evaluation-uuid-1", "evaluation-uuid-2"],
        ),
    )
    print(result)

    # Upload a result for a human-in-the-loop evaluation
    result = await sdk.evaluations.create_result(
        chat_result.uuid,
        "evaluation-uuid-3",
        CreateEvaluationResultOptions(
            result=100,
            reason="100 points because this is a great joke!",
        ),
    )
    print(result)


asyncio.run(main())
