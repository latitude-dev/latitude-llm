import asyncio
import os
from typing import Any, cast

from latitude_sdk import (
    CreateEvaluationResultOptions,
    CreateLogOptions,
    GetOrCreatePromptOptions,
    Latitude,
    LatitudeOptions,
    SystemMessage,
    UserMessage,
)
from openai import AsyncOpenAI

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"
    assert OPENAI_API_KEY, "OPENAI_API_KEY is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))
    openai = AsyncOpenAI(api_key=OPENAI_API_KEY)

    prompt = await sdk.prompts.get_or_create("prompt-path", GetOrCreatePromptOptions())

    # You can also pass a list of dictionaries, but type hinting won't be available
    messages = [
        SystemMessage(content="You are a helpful assistant."),
        UserMessage(content="Tell me a joke about Python!"),
    ]

    completion = await openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[cast(Any, dict(message)) for message in messages],
    )

    log = await sdk.logs.create(
        prompt.path,
        messages,
        CreateLogOptions(
            response=completion.choices[0].message.content,
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
