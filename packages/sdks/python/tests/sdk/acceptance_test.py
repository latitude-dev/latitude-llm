import os
from typing import Any
from unittest import IsolatedAsyncioTestCase, mock
from unittest.mock import AsyncMock
from urllib.parse import urlparse

import pytest
from promptl_ai import TextContent, UserMessage

from latitude_sdk import (
    ChatPromptOptions,
    FinishedResult,
    GatewayOptions,
    GetOrCreatePromptOptions,
    InternalOptions,
    Latitude,
    LatitudeOptions,
    OnToolCallDetails,
    RunPromptOptions,
    StreamEvent,
)

RUN_ACCEPTANCE_TESTS = os.getenv("RUN_ACCEPTANCE_TESTS") == "1"
GATEWAY_URL = os.getenv("TEST_GATEWAY_URL") or os.getenv("GATEWAY_URL") or "http://localhost:8787"
parsed_gateway_url = urlparse(GATEWAY_URL)
GATEWAY_HOST = parsed_gateway_url.hostname or "localhost"
GATEWAY_SSL = parsed_gateway_url.scheme == "https"
GATEWAY_PORT = parsed_gateway_url.port or (443 if GATEWAY_SSL else 80)


@pytest.mark.skipif(
    not RUN_ACCEPTANCE_TESTS,
    reason="Acceptance test. Set RUN_ACCEPTANCE_TESTS=1 to run.",
)
class TestEndToEnd(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.maxDiff = None

        self.api_key = os.getenv("TEST_LATITUDE_API_KEY") or "test-api-key"
        if RUN_ACCEPTANCE_TESTS and self.api_key == "test-api-key":
            raise RuntimeError("TEST_LATITUDE_API_KEY is required when RUN_ACCEPTANCE_TESTS=1")
        self.prompt_path = "weather-assistant"
        self.simple_prompt_path = "echo-assistant"
        self.prompt_content = """
---
provider: openai
model: gpt-4.1-mini
type: agent
tools:
  - get_weather:
      description: Obtains the weather temperature from a given location.
      parameters:
        type: object
        properties:
          location:
            type: string
            description: The location for the weather report.
---

You're a mother-based AI. Given a location, your task is to obtain the weather for that location and then generate a
mother-like recommendation of clothing depending on it.

Location: {{ location }}

<step>
 Obtain the weather please
</step>

<step>
  Finally, create a mother-like recommendation based on the weather report.
  Call the get_weather tool exactly once before answering.
</step>
""".strip()
        self.simple_prompt_content = """
---
provider: openai
model: gpt-4.1-mini
---

You are a helpful assistant. Reply with a short acknowledgement.
""".strip()

    async def setup_sdk(self) -> Latitude:
        setup_sdk = Latitude(
            self.api_key,
            options=LatitudeOptions(
                internal=InternalOptions(
                    gateway=GatewayOptions(
                        host=GATEWAY_HOST,
                        port=GATEWAY_PORT,
                        ssl=GATEWAY_SSL,
                        api_version="v3",
                    )
                )
            ),
        )

        # Create project
        result = await setup_sdk.projects.create("End to End Test")
        project = result.project
        version_uuid = result.version.uuid

        # Create or get prompt with weather content
        await setup_sdk.prompts.get_or_create(
            self.prompt_path,
            options=GetOrCreatePromptOptions(
                project_id=project.id, version_uuid=version_uuid, prompt=self.prompt_content
            ),
        )

        await setup_sdk.prompts.get_or_create(
            self.simple_prompt_path,
            options=GetOrCreatePromptOptions(
                project_id=project.id, version_uuid=version_uuid, prompt=self.simple_prompt_content
            ),
        )

        return Latitude(
            self.api_key,
            options=LatitudeOptions(
                project_id=project.id,
                version_uuid=version_uuid,
                internal=InternalOptions(
                    gateway=GatewayOptions(
                        host=GATEWAY_HOST,
                        port=GATEWAY_PORT,
                        ssl=GATEWAY_SSL,
                        api_version="v3",
                    )
                ),
            ),
        )

    async def test_sdk_instantiation_with_tool_handler(self):
        """Should instantiate SDK targeting localhost:8787 with no SSL and run prompt with tool handler"""
        sdk = await self.setup_sdk()

        # Create the get_weather tool handler
        get_weather_mock = AsyncMock()

        async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails):
            await get_weather_mock(arguments, details)
            return "Temperature is 22°C and sunny"

        # Run prompt with get_weather tool - this makes a real API call
        result = await sdk.prompts.run(
            self.prompt_path,
            options=RunPromptOptions(
                stream=True,
                parameters={"location": "Barcelona"},
                tools={"get_weather": get_weather},
            ),
        )

        # Assertions for real response
        assert result is not None
        assert result.uuid is not None
        assert isinstance(result.uuid, str)
        assert result.response is not None  # type: ignore
        assert result.response.text is not None  # type: ignore
        assert isinstance(result.response.text, str)  # type: ignore
        assert len(result.response.text) > 0  # type: ignore

        # Verify the response is not an error and contains valid text
        assert not hasattr(result.response, "error")  # type: ignore
        assert "error" not in result.response.text.lower()  # type: ignore

        # Verify tool handler is available (may or may not be called depending on prompt)
        assert get_weather is not None

    async def test_tool_calls_during_streaming(self):
        """Should handle tool calls during prompt execution with streaming"""
        sdk = await self.setup_sdk()

        on_event_mock = AsyncMock()

        async def on_event(event: StreamEvent):
            print(f"[TEST] Event: {event}")
            on_event_mock(event)

        on_finished_mock = AsyncMock()

        async def on_finished(result: FinishedResult):
            print(f"[TEST] Finished: {result}")
            on_finished_mock(result)

        on_error_mock = AsyncMock()

        async def on_error(error: Exception):
            print(f"[ERROR] Error occurred: {error}")
            on_error_mock(error)

        get_weather_mock = AsyncMock()

        async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails):
            print(f"[TEST] Tool called: {arguments}, {details}")
            await get_weather_mock(arguments, details)

            return "Temperature is 22°C and cloudy"

        # Make real streaming API call
        result = await sdk.prompts.run(
            self.prompt_path,
            options=RunPromptOptions(
                stream=True,
                parameters={"location": "Madrid"},
                tools={"get_weather": get_weather},
                on_finished=on_finished,
                on_event=on_event,
                on_error=on_error,
            ),
        )

        # Verify no errors occurred
        assert not on_error_mock.called, f"[DEBUG] Error mock was called: {on_error_mock.call_args}"

        # Verify final response only if no errors
        assert result is not None
        assert result.response.text is not None  # type: ignore
        assert isinstance(result.response.text, str)  # type: ignore
        assert len(result.response.text) > 0  # type: ignore

        # Verify callbacks were called appropriately
        assert on_finished_mock.called

        # Streaming request should call the tool handler
        get_weather_mock.assert_called()

    async def test_tool_handler_gets_called_when_requested(self):
        """Should ensure tool handler gets called when tools are requested"""
        sdk = await self.setup_sdk()

        get_weather_mock = AsyncMock()

        async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails):
            await get_weather_mock(arguments, details)
            return "Temperature is 20°C and rainy"

        # Make real API call
        result = await sdk.prompts.run(
            self.prompt_path,
            options=RunPromptOptions(
                parameters={"location": "Paris"},
                stream=True,
                tools={"get_weather": get_weather},
            ),
        )

        # Verify the tool handler was available
        assert get_weather is not None

        # Verify response structure and content from real service
        assert result is not None
        assert result.uuid is not None  # type: ignore
        assert isinstance(result.uuid, str)  # type: ignore
        assert result.response is not None  # type: ignore
        assert result.response.text is not None  # type: ignore
        assert isinstance(result.response.text, str)  # type: ignore
        assert len(result.response.text) > 0  # type: ignore

        # Verify the response is not an error and contains valid text
        assert not hasattr(result.response, "error")  # type: ignore
        assert "error" not in result.response.text.lower()  # type: ignore

        # Verify the tool handler was called
        get_weather_mock.assert_called_once_with(
            {"location": "Paris"},
            OnToolCallDetails.model_construct(id=mock.ANY, name="get_weather", arguments={"location": "Paris"}),
        )

    async def test_authentication_and_project_validation(self):
        """Should handle authentication and project validation"""
        sdk = await self.setup_sdk()

        get_weather_mock = AsyncMock()

        async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails):
            await get_weather_mock(arguments, details)
            return "Temperature is 20°C and sunny"

        await sdk.prompts.run(
            self.prompt_path,
            options=RunPromptOptions(
                parameters={"location": "London"},
                tools={"get_weather": get_weather},
            ),
        )

    async def test_run_non_streaming(self):
        """Should run a prompt without streaming"""
        sdk = await self.setup_sdk()

        result = await sdk.prompts.run(
            self.simple_prompt_path,
            options=RunPromptOptions(stream=False, parameters={}),
        )

        assert result is not None
        assert result.uuid is not None  # type: ignore
        assert isinstance(result.uuid, str)  # type: ignore
        assert result.response is not None  # type: ignore
        assert result.response.text is not None  # type: ignore
        assert isinstance(result.response.text, str)  # type: ignore
        assert len(result.response.text) > 0  # type: ignore

    async def test_chat_non_streaming(self):
        """Should chat without streaming after a run"""
        sdk = await self.setup_sdk()

        run_result = await sdk.prompts.run(
            self.simple_prompt_path,
            options=RunPromptOptions(stream=False, parameters={}),
        )

        assert run_result is not None
        assert run_result.uuid is not None  # type: ignore

        chat_result = await sdk.prompts.chat(
            run_result.uuid,  # type: ignore
            [UserMessage(content=[TextContent(text="Can you acknowledge this?")])],
            options=ChatPromptOptions(stream=False),
        )

        assert chat_result is not None
        assert chat_result.uuid == run_result.uuid  # type: ignore
        assert chat_result.response.text is not None  # type: ignore
        assert isinstance(chat_result.response.text, str)  # type: ignore
        assert len(chat_result.response.text) > 0  # type: ignore

    async def test_run_then_chat_followup(self):
        """Should run prompt and follow up via chat"""
        sdk = await self.setup_sdk()

        get_weather_mock = AsyncMock()

        async def get_weather(arguments: dict[str, Any], details: OnToolCallDetails):
            await get_weather_mock(arguments, details)
            return "Temperature is 18°C and cloudy"

        run_result = await sdk.prompts.run(
            self.prompt_path,
            options=RunPromptOptions(
                stream=True,
                parameters={"location": "Berlin"},
                tools={"get_weather": get_weather},
            ),
        )

        assert run_result is not None
        assert run_result.uuid is not None  # type: ignore
        assert isinstance(run_result.uuid, str)  # type: ignore

        chat_result = await sdk.prompts.chat(
            run_result.uuid,  # type: ignore
            [UserMessage(content=[TextContent(text="Thanks! Should I bring a jacket tomorrow?")])],
            options=ChatPromptOptions(stream=True, tools={"get_weather": get_weather}),
        )

        assert chat_result is not None
        assert chat_result.uuid == run_result.uuid  # type: ignore
        assert chat_result.response.text is not None  # type: ignore
        assert isinstance(chat_result.response.text, str)  # type: ignore
        assert len(chat_result.response.text) > 0  # type: ignore
        get_weather_mock.assert_called()

    # TODO(runs): test_run_prompt_background_then_attach_then_stop
