import asyncio
import os
from typing import Any, cast

from anthropic import AsyncAnthropic
from latitude_sdk import (
    CreateEvaluationResultOptions,
    CreateLogOptions,
    GetOrCreatePromptOptions,
    Latitude,
    LatitudeOptions,
    SystemMessage,
    UserMessage,
)

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"
    assert ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))
    anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    prompt = await sdk.prompts.get_or_create("prompt-path", GetOrCreatePromptOptions())

    # You can also pass a list of dictionaries, but type hinting won't be available
    messages = [
        SystemMessage(content="You are a helpful assistant."),
        UserMessage(content="Tell me a joke about Python!"),
    ]

    completion = await anthropic.messages.create(
        max_tokens=1000,
        model="claude-3-5-sonnet-latest",
        messages=[cast(Any, dict(message)) for message in messages],
    )

    assert completion.content[0].type == "text"

    log = await sdk.logs.create(
        prompt.path,
        messages,
        CreateLogOptions(
            response=completion.content[0].text,
        ),
    )

    result = await sdk.evaluations.create_result(
        log.uuid,
        "evaluation-uuid",
        CreateEvaluationResultOptions(
            result=100,
            reason="100 points because this is a great joke!",
        ),
    )
    print(result)


asyncio.run(main())
