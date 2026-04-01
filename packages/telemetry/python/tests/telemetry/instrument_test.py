from datetime import datetime
from unittest import mock

import litellm
from anthropic import Anthropic
from anthropic.types.message import Message as AnthropicMessage
from anthropic.types.text_block import TextBlock as AnthropicTextBlock
from anthropic.types.usage import Usage as AnthropicUsage
from litellm.types.utils import Choices as LiteLLMChoices
from litellm.types.utils import Message as LiteLLMMessage
from litellm.types.utils import ModelResponse as LiteLLMModelResponse
from litellm.types.utils import Usage as LiteLLMUsage
from openai import OpenAI
from openai.types.chat import ChatCompletion as OpenAIChatCompletion
from openai.types.chat import ChatCompletionMessage as OpenAIChatCompletionMessage
from openai.types.chat.chat_completion import Choice as OpenAIChoice
from openai.types.completion_usage import CompletionUsage as OpenAICompletionUsage

from latitude_telemetry import Instrumentors
from tests.utils import TestCase


class TestInstrument(TestCase):
    def create_openai_mock(self):
        openai = OpenAI(api_key="fake-api-key")

        completion = OpenAIChatCompletion(
            object="chat.completion",
            id="fake-id",
            model="gpt-4o-mini",
            choices=[
                OpenAIChoice(
                    finish_reason="stop",
                    index=0,
                    message=OpenAIChatCompletionMessage(
                        role="assistant",
                        content="World!",
                    ),
                )
            ],
            usage=OpenAICompletionUsage(
                total_tokens=30,
                prompt_tokens=10,
                completion_tokens=20,
            ),
            created=int(datetime.now().timestamp()),
        )

        return openai, completion

    def test_success_instruments_openai(self):
        """Test that OpenAI instrumentation creates spans with correct attributes."""
        openai, completion = self.create_openai_mock()

        with mock.patch("openai.resources.chat.completions.Completions.create", return_value=completion):
            self.telemetry.instrument([Instrumentors.OpenAI])
            openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 1)

        span = spans[0]
        self.assert_span_name(span, "openai.chat")
        self.assert_span_has_attribute(span, "gen_ai.system", "openai")
        self.assert_span_has_attribute(span, "gen_ai.request.model", "gpt-4o-mini")
        self.assert_span_has_attribute(span, "gen_ai.response.model", "gpt-4o-mini")
        self.assert_span_has_attribute(span, "gen_ai.usage.input_tokens", 10)
        self.assert_span_has_attribute(span, "gen_ai.usage.output_tokens", 20)

    def test_success_not_instruments_openai(self):
        """Test that uninstrumented OpenAI calls don't create spans."""
        openai, completion = self.create_openai_mock()

        with mock.patch("openai.resources.chat.completions.Completions.create", return_value=completion):
            self.telemetry.uninstrument()
            openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 0)

    def create_anthropic_mock(self):
        anthropic = Anthropic(api_key="fake-api-key")

        completion = AnthropicMessage(
            type="message",
            id="fake-id",
            role="assistant",
            content=[AnthropicTextBlock(type="text", text="World!")],
            model="claude-3-5-sonnet-latest",
            stop_reason="end_turn",
            usage=AnthropicUsage(
                input_tokens=10,
                output_tokens=20,
            ),
        )

        return anthropic, completion

    def test_success_instruments_anthropic(self):
        """Test that Anthropic instrumentation creates spans with correct attributes."""
        anthropic, completion = self.create_anthropic_mock()

        with mock.patch("anthropic.resources.messages.Messages.create", return_value=completion):
            self.telemetry.instrument([Instrumentors.Anthropic])
            anthropic.messages.create(
                max_tokens=1000,
                model="claude-3-5-sonnet-latest",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 1)

        span = spans[0]
        self.assert_span_name(span, "anthropic.chat")
        self.assert_span_has_attribute(span, "gen_ai.system", "Anthropic")
        self.assert_span_has_attribute(span, "gen_ai.request.model", "claude-3-5-sonnet-latest")
        self.assert_span_has_attribute(span, "gen_ai.response.model", "claude-3-5-sonnet-latest")
        self.assert_span_has_attribute(span, "gen_ai.usage.input_tokens", 10)
        self.assert_span_has_attribute(span, "gen_ai.usage.output_tokens", 20)

    def test_success_not_instruments_anthropic(self):
        """Test that uninstrumented Anthropic calls don't create spans."""
        anthropic, completion = self.create_anthropic_mock()

        with mock.patch("anthropic.resources.messages.Messages.create", return_value=completion):
            self.telemetry.uninstrument()
            anthropic.messages.create(
                max_tokens=1000,
                model="claude-3-5-sonnet-latest",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 0)

    def create_litellm_mock(self):
        completion = LiteLLMModelResponse(
            object="text_completion",
            id="fake-id",
            model="gpt-4o-mini",
            choices=[
                LiteLLMChoices(
                    finish_reason="stop",
                    message=LiteLLMMessage(
                        role="assistant",
                        content="World!",
                    ),
                )
            ],
            usage=LiteLLMUsage(
                total_tokens=30,
                prompt_tokens=10,
                completion_tokens=20,
            ),
            created=int(datetime.now().timestamp()),
        )

        return litellm, completion

    def test_success_instruments_litellm(self):
        """Test that LiteLLM instrumentation creates spans with correct attributes."""
        litellm, completion = self.create_litellm_mock()

        with mock.patch("litellm.llms.openai.openai.OpenAIChatCompletion.completion", return_value=completion):
            self.telemetry.instrument([Instrumentors.LiteLLM])
            litellm.completion(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 1)

        span = spans[0]
        self.assert_span_name(span, "completion")
        self.assert_span_has_attribute(span, "llm.model_name", "gpt-4o-mini")
        self.assert_span_has_attribute(span, "llm.token_count.prompt", 10)
        self.assert_span_has_attribute(span, "llm.token_count.completion", 20)
        self.assert_span_has_attribute(span, "llm.token_count.total", 30)

    def test_success_not_instruments_litellm(self):
        """Test that uninstrumented LiteLLM calls don't create spans."""
        litellm, completion = self.create_litellm_mock()

        with mock.patch("litellm.llms.openai.openai.OpenAIChatCompletion.completion", return_value=completion):
            self.telemetry.uninstrument()
            litellm.completion(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 0)
