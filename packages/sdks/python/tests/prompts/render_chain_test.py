from typing import List
from unittest import mock
from unittest.mock import AsyncMock

from promptl_ai import (
    Adapter,
    AssistantMessage,
    Error,
    ErrorPosition,
    MessageLike,
    PromptlError,
    SystemMessage,
    TextContent,
    UserMessage,
    openai,
)

from latitude_sdk import RenderChainOptions, RenderChainResult
from tests.utils import TestCase, fixtures


class TestRenderChain(TestCase):
    async def test_success_without_adapter(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "The definitive answer is 42.",
                "Goodbye!",
            ]
        )
        prompt = fixtures.PROMPT
        options = RenderChainOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.Default,
        )

        result = await self.sdk.prompts.render_chain(prompt, on_step_mock, options)

        expected_messages: List[MessageLike] = [
            SystemMessage(content=[TextContent(text="You are a helpful assistant.")]),
            UserMessage(content=[TextContent(text="What is PromptL")]),
            AssistantMessage(content=[TextContent(text="The definitive answer is 42.")]),
            SystemMessage(content=[TextContent(text="Now say bye.")]),
            AssistantMessage(content=[TextContent(text="Goodbye!")]),
        ]
        expected_config = {
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "temperature": 0.5,
            "maxTokens": 1024,
            "topP": 0.9,
        }

        self.assertEqual(
            result,
            RenderChainResult(
                messages=expected_messages,
                config=expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.call_args_list[0][0],
            (
                expected_messages[:2],
                expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.call_args_list[1][0],
            (
                expected_messages[:-1],
                expected_config,
            ),
        )
        self.assertEqual(on_step_mock.await_count, 2)

    async def test_success_with_adapter(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "The definitive answer is 42.",
                "Goodbye!",
            ]
        )
        prompt = fixtures.PROMPT
        options = RenderChainOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.OpenAI,
        )

        result = await self.sdk.prompts.render_chain(prompt, on_step_mock, options)

        expected_messages: List[MessageLike] = [
            openai.SystemMessage(content="You are a helpful assistant."),
            openai.UserMessage(content=[openai.TextContent(text="What is PromptL")]),
            openai.AssistantMessage(content=[openai.TextContent(text="The definitive answer is 42.")]),
            openai.SystemMessage(content="Now say bye."),
            openai.AssistantMessage(content=[openai.TextContent(text="Goodbye!")]),
        ]
        expected_config = {
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "temperature": 0.5,
            "max_tokens": 1024,
            "top_p": 0.9,
        }

        self.assertEqual(
            result,
            RenderChainResult(
                messages=expected_messages,
                config=expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.call_args_list[0][0],
            (
                expected_messages[:2],
                expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.call_args_list[1][0],
            (
                expected_messages[:-1],
                expected_config,
            ),
        )
        self.assertEqual(on_step_mock.await_count, 2)

    async def test_fails(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "The definitive answer is 42.",
                "Goodbye!",
            ]
        )
        prompt = fixtures.PROMPT
        options = RenderChainOptions(
            adapter=Adapter.Default,
        )

        with self.assertRaises(PromptlError) as context:
            await self.sdk.prompts.render_chain(prompt, on_step_mock, options)

        self.assertEqual(
            context.exception,
            PromptlError(
                Error.model_construct(
                    name="CompileError",
                    code="variable-not-declared",
                    message="Variable 'question' is not declared",
                    start=ErrorPosition(line=11, column=14, character=141),
                    end=ErrorPosition(line=11, column=22, character=149),
                    frame=mock.ANY,
                )
            ),
        )
