import asyncio
import os
from typing import Any, Dict, List, Sequence, Union

from devtools import pprint
from latitude_sdk import Latitude, LatitudeOptions, RenderChainOptions
from openai import AsyncOpenAI
from promptl_ai import Adapter, MessageLike


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)

    # Use oficial OpenAI SDK
    openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    async def on_step(
        messages: List[MessageLike], config: Dict[str, Any]
    ) -> Union[str, MessageLike, Sequence[MessageLike]]:
        response = await openai.chat.completions.create(
            model=config["model"],
            temperature=config["temperature"],
            messages=[message.model_dump() for message in messages],
        )

        return response.choices[0].message.model_dump()

    prompt = await sdk.prompts.get("render-chain/example")

    # Here we render the chain and each step will be sent to OpenAI
    result = await sdk.prompts.render_chain(
        prompt,
        on_step,
        RenderChainOptions(
            parameters={"question": "What is the meaning of life?"},
            adapter=Adapter.OpenAI,
        ),
    )

    pprint(result)


asyncio.run(run())
