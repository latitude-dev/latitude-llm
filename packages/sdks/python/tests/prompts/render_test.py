from unittest import mock

from promptl_ai import (
    Adapter,
    Error,
    ErrorPosition,
    PromptlError,
    SystemMessage,
    TextContent,
    UserMessage,
    anthropic,
    openai,
)

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

    async def test_success_with_adapter_singlepart(self):
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

    async def test_success_with_adapter_multipart(self):
        parts = fixtures.PROMPT.content.split("</step>")
        prompt = "</step>".join(
            [
                parts[0]
                + """
<user>
    This is text.
    <content-image>This is an image.</content-image>
    <content-file mime="application/pdf">This is a PDF.</content-file>
</user>
""",
                *parts[1:],
            ]
        )
        options = RenderPromptOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.Anthropic,
        )

        result = await self.sdk.prompts.render(prompt, options)

        self.assertEqual(
            result,
            RenderPromptResult(
                messages=[
                    anthropic.UserMessage(content=[anthropic.TextContent(text="What is PromptL")]),
                    anthropic.UserMessage(
                        content=[
                            anthropic.TextContent(text="This is text."),
                            anthropic.ImageContent(
                                source=anthropic.ContentSource(
                                    type="base64", media_type="image/png", data="This is an image."
                                )
                            ),
                            anthropic.DocumentContent(
                                source=anthropic.ContentSource(
                                    type="base64", media_type="application/pdf", data="This is a PDF."
                                )
                            ),
                        ]
                    ),
                ],
                config={
                    "provider": "OpenAI",
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "max_tokens": 1024,
                    "top_p": 0.9,
                    "system": [{"type": "text", "text": "You are a helpful assistant."}],
                },
            ),
        )

    async def test_success_with_references(self):
        references = {
            "instructions": "<system>\nYou are an expert assistant. Always be concise.\n</system>",
        }
        prompt = '<prompt path="instructions" />\n<user>{{ question }}</user>'
        options = RenderPromptOptions(
            parameters={"question": "What is PromptL"},
            adapter=Adapter.Default,
            references=references,
        )

        result = await self.sdk.prompts.render(prompt, options)

        self.assertEqual(
            result,
            RenderPromptResult(
                messages=[
                    SystemMessage(content=[TextContent(text="You are an expert assistant. Always be concise.")]),
                    UserMessage(content=[TextContent(text="What is PromptL")]),
                ],
                config={},
            ),
        )

    async def test_success_with_relative_references(self):
        references = {
            "folder/child": "child content",
        }
        prompt = '<prompt path="child" />'
        options = RenderPromptOptions(
            adapter=Adapter.Default,
            full_path="folder/parent",
            references=references,
        )

        result = await self.sdk.prompts.render(prompt, options)

        self.assertEqual(
            result,
            RenderPromptResult(
                messages=[
                    SystemMessage(content=[TextContent(text="child content")]),
                ],
                config={},
            ),
        )

    async def test_fails(self):
        parts = fixtures.PROMPT.content.split("---")
        prompt = f"""
---
{parts[1].strip()}
---
{{{{ increment += 1 }}}}
{parts[2].strip()}
""".strip()  # noqa: E501
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
                    message="Variable 'increment' is not declared",
                    start=ErrorPosition(line=8, column=4, character=90),
                    end=ErrorPosition(line=8, column=13, character=99),
                    frame=mock.ANY,
                )
            ),
        )
