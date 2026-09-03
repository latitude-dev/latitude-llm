import asyncio
import os

from dotenv import load_dotenv
from latitude_sdk import (
    Latitude,
    LatitudeOptions,
    RunPromptOptions,
)

load_dotenv()

api_key = os.getenv("LATITUDE_API_KEY")
project_id = os.getenv("LATITUDE_PROJECT_ID")
version_uuid = os.getenv("LATITUDE_VERSION_UUID") or None

if not api_key or api_key == "your-api-key-here":
    raise ValueError(
        "Please set your LATITUDE_API_KEY in the .env file. "
        "You can find it in your Latitude project settings under 'API Access'."
    )

if not project_id or project_id == "your-project-id-here":
    raise ValueError(
        "Please set your LATITUDE_PROJECT_ID in the .env file. "
        "You can find it in your Latitude project settings."
    )

sdk = Latitude(
    api_key,
    LatitudeOptions(
        project_id=int(project_id),
        version_uuid=version_uuid,
    ),
)


async def run_prompt(prompt_path: str, parameters: dict | None = None):
    """Run a prompt and print the result."""
    result = await sdk.prompts.run(
        prompt_path,
        RunPromptOptions(
            parameters=parameters or {},
            on_event=lambda event: print(f"Event: {event}"),
            on_finished=lambda result: print(f"Finished: {result.uuid}"),
            on_error=lambda error: print(f"Error: {error}"),
            stream=True,
        ),
    )
    print(f"\nConversation UUID: {result.uuid}")
    print(f"Response: {result.response}")
    return result


async def list_prompts():
    """List all available prompts in your project."""
    prompts = await sdk.prompts.get_all()
    print("Available prompts:")
    for prompt in prompts:
        print(f"  - {prompt.path}")
    return prompts


async def main():
    print("Latitude SDK configured successfully!\n")

    # List all available prompts
    prompts = await list_prompts()

    # Uncomment the following to run a specific prompt:
    # result = await run_prompt("your-prompt-path", {"param_name": "param_value"})


if __name__ == "__main__":
    asyncio.run(main())
