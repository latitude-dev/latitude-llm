import asyncio
from pprint import pp  # type: ignore

from latitude_sdk import (
    ApiError,
    ChatPromptOptions,
    CreateEvaluationResultOptions,
    CreateLogOptions,
    GatewayOptions,
    GetOrCreatePromptOptions,
    GetPromptOptions,
    InternalOptions,
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
    TextContent,
    TriggerEvaluationOptions,
    UserMessage,
)


# TODO Move to root/examples when latitude-sdk is published
async def main():
    sdk = Latitude(
        api_key="6f67407c-da6c-4a4d-9615-a3eb59e51d29",
        options=LatitudeOptions(
            project_id=3,
            version_uuid="57502e00-20c2-4411-8b4b-44bc9008079e",
            internal=InternalOptions(gateway=GatewayOptions(host="localhost", port=8787, ssl=False, api_version="v2")),
        ),
    )

    try:
        print("Getting prompt...")
        get_prompt_result = await sdk.prompts.get("prompt", GetPromptOptions())
        pp(get_prompt_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Getting or creating prompt...")
        get_or_create_prompt_result = await sdk.prompts.get_or_create("prompt3", GetOrCreatePromptOptions())
        pp(get_or_create_prompt_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Running prompt...")
        run_prompt_result = await sdk.prompts.run(
            "prompt",
            RunPromptOptions(
                on_event=lambda event: print(event, "\n" * 2),
                on_finished=lambda event: print(event, "\n" * 2),
                on_error=lambda error: print(error, "\n" * 2),
                custom_identifier="custom!",
                parameters={"topic": "Python"},
                stream=True,
            ),
        )
        assert run_prompt_result is not None
        pp(run_prompt_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Chat prompt...")
        chat_prompt_result = await sdk.prompts.chat(
            run_prompt_result.uuid,
            [
                UserMessage(content=[TextContent(text="Hello, how are you?")]),
                UserMessage(content="I'm fine btw"),
            ],
            ChatPromptOptions(
                on_event=lambda event: print(event, "\n" * 2),
                on_finished=lambda event: print(event, "\n" * 2),
                on_error=lambda error: print(error, "\n" * 2),
                stream=True,
            ),
        )
        assert chat_prompt_result is not None
        pp(chat_prompt_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Create log...")
        create_log_result = await sdk.logs.create(
            "prompt",
            [
                UserMessage(content=[TextContent(text="Hello, how are you?")]),
                UserMessage(content=[TextContent(text="I'm fine btw")]),
            ],
            CreateLogOptions(),
        )
        pp(create_log_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Trigger evaluation...")
        trigger_evaluation_result = await sdk.evaluations.trigger(
            chat_prompt_result.uuid,
            TriggerEvaluationOptions(evaluation_uuids=["46d29f2d-7086-44b8-9220-af1dea1e3692"]),
        )
        pp(trigger_evaluation_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

        print("Create evaluation result...")
        create_evaluation_result_result = await sdk.evaluations.create_result(
            chat_prompt_result.uuid,
            "d7a04129-9df8-4047-ba93-6349029a1000",
            CreateEvaluationResultOptions(result="I like it!", reason="Because I like it!"),
        )
        pp(create_evaluation_result_result.model_dump())
        print("\n" * 2)
        print("-" * 100)

    except ApiError as error:
        pp(error.__dict__)
    except Exception as e:
        raise e


asyncio.run(main())
