from typing import Any, List
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

from latitude_sdk import ParameterType, Prompt, PromptParameter, Providers, RenderChainOptions, RenderChainResult
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
            on_step_mock.await_args_list[0][0],
            (
                expected_messages[:2],
                expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.await_args_list[1][0],
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
            on_step_mock.await_args_list[0][0],
            (
                expected_messages[:2],
                expected_config,
            ),
        )
        self.assertEqual(
            on_step_mock.await_args_list[1][0],
            (
                expected_messages[:-1],
                expected_config,
            ),
        )
        self.assertEqual(on_step_mock.await_count, 2)

    async def test_success_with_references(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "The definitive answer is 42.",
            ]
        )
        references = {
            "instructions": "You are a helpful assistant.",
        }
        prompt = Prompt(
            uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
            path="prompt",
            content='<step>\n<prompt path="instructions" />\n<user>{{ question }}</user>\n</step>',
            config={},
            parameters={"question": PromptParameter(type=ParameterType.Text)},
            provider=Providers.OpenAI,
        )
        options = RenderChainOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.Default,
            references=references,
        )

        result = await self.sdk.prompts.render_chain(prompt, on_step_mock, options)

        expected_messages: List[MessageLike] = [
            SystemMessage(content=[TextContent(text="You are a helpful assistant.")]),
            UserMessage(content=[TextContent(text="What is PromptL")]),
            AssistantMessage(content=[TextContent(text="The definitive answer is 42.")]),
        ]
        expected_config: dict[str, Any] = {}

        self.assertEqual(
            result,
            RenderChainResult(
                messages=expected_messages,
                config=expected_config,
            ),
        )
        self.assertEqual(on_step_mock.await_count, 1)

    async def test_success_with_relative_references(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "Done!",
            ]
        )
        references = {
            "folder/child": "Child system prompt.",
        }
        prompt = Prompt(
            uuid="e01a1035-6ed3-4edc-88e6-c0748ea300c7",
            path="folder/parent",
            content='<step>\n<prompt path="child" />\n<user>Ask me anything.</user>\n</step>',
            config={},
            parameters={},
            provider=Providers.OpenAI,
        )
        options = RenderChainOptions(
            adapter=Adapter.Default,
            references=references,
        )

        result = await self.sdk.prompts.render_chain(prompt, on_step_mock, options)

        expected_messages: List[MessageLike] = [
            SystemMessage(content=[TextContent(text="Child system prompt.")]),
            UserMessage(content=[TextContent(text="Ask me anything.")]),
            AssistantMessage(content=[TextContent(text="Done!")]),
        ]
        expected_config: dict[str, Any] = {}

        self.assertEqual(
            result,
            RenderChainResult(
                messages=expected_messages,
                config=expected_config,
            ),
        )
        self.assertEqual(on_step_mock.await_count, 1)

    async def test_fails(self):
        on_step_mock = AsyncMock(
            side_effect=[
                "The definitive answer is 42.",
                "Goodbye!",
            ]
        )
        parts = fixtures.PROMPT.content.split("---")
        prompt = Prompt(
            **dict(
                fixtures.PROMPT,
                content=f"""
---
{parts[1].strip()}
---
{{{{ increment += 1 }}}}
{parts[2].strip()}
""".strip(),  # noqa: E501
            ),
        )
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
                    message="Variable 'increment' is not declared",
                    start=ErrorPosition(line=8, column=4, character=90),
                    end=ErrorPosition(line=8, column=13, character=99),
                    frame=mock.ANY,
                )
            ),
        )
