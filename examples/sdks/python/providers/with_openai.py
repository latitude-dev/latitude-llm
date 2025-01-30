import asyncio
import os
from typing import Any, Dict, List, Sequence, Union

from latitude_sdk import CreateEvaluationResultOptions, CreateLogOptions, Latitude, LatitudeOptions, RenderChainOptions
from openai import AsyncOpenAI
from promptl_ai import Adapter, MessageLike

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"
    assert OPENAI_API_KEY, "OPENAI_API_KEY is not set"

    sdk = Latitude(LATITUDE_API_KEY, LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))
    openai = AsyncOpenAI(api_key=OPENAI_API_KEY)

    async def on_step(
        messages: List[MessageLike], config: Dict[str, Any]
    ) -> Union[str, MessageLike, Sequence[MessageLike]]:
        response = await openai.chat.completions.create(
            **config,
            messages=[message.model_dump() for message in messages],
        )

        return response.choices[0].message.model_dump()

    prompt = await sdk.prompts.get_or_create("prompt-path")

    result = await sdk.prompts.render_chain(
        prompt,
        on_step,
        RenderChainOptions(
            parameters={
                # Any parameters your prompt expects
            },
            adapter=Adapter.OpenAI,
        ),
    )
    print(result)

    log = await sdk.logs.create(
        prompt.path,
        result.messages[:-1],
        CreateLogOptions(
            response=result.messages[-1].content[0].text,
        ),
    )
    print(log)

    eval = await sdk.evaluations.create_result(
        log.uuid,
        "evaluation-uuid",
        CreateEvaluationResultOptions(
            result=100,
            reason="100 points because this is a great response!",
        ),
    )
    print(eval)


asyncio.run(main())
