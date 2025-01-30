from unittest import mock

from promptl_ai import Adapter, Error, ErrorPosition, PromptlError, SystemMessage, TextContent, UserMessage, openai

from latitude_sdk import RenderPromptOptions, RenderPromptResult
from tests.utils import TestCase, fixtures


class TestRenderPrompt(TestCase):
    async def test_success_without_adapter(self):
        prompt = fixtures.PROMPT.content
        options = RenderPromptOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.Default,
        )

        result = await self.sdk.prompts.render(prompt, options)

        self.assertEqual(
            result,
            RenderPromptResult(
                messages=[
                    SystemMessage(content=[TextContent(text="You are a helpful assistant.")]),
                    UserMessage(content=[TextContent(text="What is PromptL")]),
                ],
                config={
                    "provider": "OpenAI",
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "maxTokens": 1024,
                    "topP": 0.9,
                },
            ),
        )

    async def test_success_with_adapter(self):
        prompt = fixtures.PROMPT.content
        options = RenderPromptOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.OpenAI,
        )

        result = await self.sdk.prompts.render(prompt, options)

        self.assertEqual(
            result,
            RenderPromptResult(
                messages=[
                    openai.SystemMessage(content="You are a helpful assistant."),
                    openai.UserMessage(content=[openai.TextContent(text="What is PromptL")]),
                ],
                config={
                    "provider": "OpenAI",
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "max_tokens": 1024,
                    "top_p": 0.9,
                },
            ),
        )

    async def test_fails(self):
        prompt = fixtures.PROMPT.content
        options = RenderPromptOptions(
            adapter=Adapter.Default,
        )

        with self.assertRaises(PromptlError) as context:
            await self.sdk.prompts.render(prompt, options)

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
