import asyncio
import os

from devtools import pprint
from latitude_sdk import (
    AnnotateEvaluationOptions,
    CreateLogOptions,
    RenderPromptOptions,
    Latitude,
    LatitudeOptions,
)
from openai import AsyncOpenAI
from promptl_ai import Adapter


# To run this example you need to create a evaluation on the prompt: `annontate-log/example`
# Info: https://docs.latitude.so/guides/evaluations/overview
EVALUATION_UUID = "YOUR_EVALUATION_UUID"


async def run():
    api_key = os.getenv("LATITUDE_API_KEY")
    sdk_options = LatitudeOptions(
        project_id=int(os.getenv("PROJECT_ID")),
        version_uuid="live",
    )
    sdk = Latitude(api_key, sdk_options)
    openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # Get the prompt from Latitude
    prompt = await sdk.prompts.get("annotate-log/example")

    # Render the messages from the Latitude prompt
    render = await sdk.prompts.render(prompt.content, RenderPromptOptions(adapter=Adapter.OpenAI))

    # Call OpenAI with the messages from the prompt
    llm_result = await openai.chat.completions.create(
        model=render.config["model"],
        temperature=render.config["temperature"],
        messages=[message.model_dump() for message in render.messages],
    )

    llm_response = llm_result.choices[0].message.content
    latitude_render = await sdk.prompts.render(
        prompt.content,
        RenderPromptOptions(
            adapter=Adapter.Default,
        ),
    )

    log_result = await sdk.logs.create(
        "annotate-log/example",
        latitude_render.messages,
        CreateLogOptions(response=llm_response),
    )

    result = await sdk.evaluations.annotate(
        log_result.uuid, 1, EVALUATION_UUID, AnnotateEvaluationOptions(reason="This is a bad joke!")
    )

    pprint(result)


asyncio.run(run())
