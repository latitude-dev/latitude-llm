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

    print("Getting prompt...")
    result = await sdk.prompts.get("prompt", GetPromptOptions(version_uuid="57502e00-20c2-4411-8b4b-44bc9008079e"))
    print(result)

    print("-" * 100)

    print("Running prompt...")
    result = await sdk.prompts.run(
        "prompt",
        RunPromptOptions(
            project_id=3,
            version_uuid="57502e00-20c2-4411-8b4b-44bc9008079e",
            on_event=lambda event, data: print(event, data),
            on_finished=lambda data: print(data),
            on_error=lambda error: print(error),
            custom_identifier="custom!",
            parameters={"topic": "Python"},
            stream=True,
        ),
    )
    print(result)


asyncio.run(main())
