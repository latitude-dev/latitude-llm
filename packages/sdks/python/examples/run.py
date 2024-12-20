import asyncio

from latitude_sdk import GatewayOptions, GetPromptOptions, InternalOptions, Latitude, LatitudeOptions, RunPromptOptions


async def main():
    sdk = Latitude(
        api_key="6f67407c-da6c-4a4d-9615-a3eb59e51d29",
        options=LatitudeOptions(
            project_id=3,
            internal=InternalOptions(gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v2")),
        ),
    )

    result = await sdk.prompts.get("prompt", GetPromptOptions(version_uuid="57502e00-20c2-4411-8b4b-44bc9008079e"))
    print(result)

    result = await sdk.prompts.run("prompt", RunPromptOptions(version_uuid="57502e00-20c2-4411-8b4b-44bc9008079e"))
    print(result)


asyncio.run(main())
