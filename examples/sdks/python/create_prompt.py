import asyncio
import os

from latitude_sdk import GetOrCreatePromptOptions, Latitude, LatitudeOptions

LATITUDE_API_KEY = os.getenv("LATITUDE_API_KEY")
LATITUDE_PROJECT_ID = os.getenv("LATITUDE_PROJECT_ID")


async def main():
    assert LATITUDE_API_KEY, "LATITUDE_API_KEY is not set"
    assert LATITUDE_PROJECT_ID, "LATITUDE_PROJECT_ID is not set"

    sdk = Latitude(api_key=LATITUDE_API_KEY, options=LatitudeOptions(project_id=int(LATITUDE_PROJECT_ID)))

    prompt = await sdk.prompts.get_or_create(
        "prompt-path",
        GetOrCreatePromptOptions(
            prompt="""
Answer succinctly yet complete.
<user>
    Tell me a joke about a {{topic}}
</user>                                                          
"""
        ),
    )
    print(prompt)


asyncio.run(main())
