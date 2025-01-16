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
        openai, completion = self.create_openai_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("openai.resources.chat.completions.Completions.create", return_value=completion):
            self.telemetry.instrument([Instrumentors.OpenAI])
            openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body=self.create_instrumentation_request(
                name="openai.chat",
                attributes=[
                    {"key": "llm.request.type", "value": {"stringValue": "chat"}},
                    {"key": "gen_ai.system", "value": {"stringValue": "OpenAI"}},
                    {"key": "gen_ai.request.model", "value": {"stringValue": "gpt-4o-mini"}},
                    {"key": "llm.headers", "value": {"stringValue": "None"}},
                    {"key": "llm.is_streaming", "value": {"boolValue": False}},
                    {"key": "gen_ai.response.model", "value": {"stringValue": "gpt-4o-mini"}},
                    {"key": "llm.usage.total_tokens", "value": {"intValue": 30}},
                    {"key": "gen_ai.usage.completion_tokens", "value": {"intValue": 20}},
                    {"key": "gen_ai.usage.prompt_tokens", "value": {"intValue": 10}},
                    {"key": "gen_ai.completion.0.finish_reason", "value": {"stringValue": "stop"}},
                    {"key": "gen_ai.completion.0.role", "value": {"stringValue": "assistant"}},
                    {"key": "gen_ai.completion.0.content", "value": {"stringValue": "World!"}},
                ],
            ),
        )
        self.assertEqual(endpoint_mock.call_count, 1)

    def test_success_not_instruments_openai(self):
        openai, completion = self.create_openai_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("openai.resources.chat.completions.Completions.create", return_value=completion):
            self.telemetry.uninstrument()
            openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        self.assertEqual(endpoint_mock.call_count, 0)

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
        anthropic, completion = self.create_anthropic_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("anthropic.resources.messages.Messages.create", return_value=completion):
            self.telemetry.instrument([Instrumentors.Anthropic])
            anthropic.messages.create(
                max_tokens=1000,
                model="claude-3-5-sonnet-latest",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body=self.create_instrumentation_request(
                name="anthropic.chat",
                attributes=[
                    {"key": "gen_ai.system", "value": {"stringValue": "Anthropic"}},
                    {"key": "llm.request.type", "value": {"stringValue": "completion"}},
                    {"key": "gen_ai.request.model", "value": {"stringValue": "claude-3-5-sonnet-latest"}},
                    {"key": "gen_ai.prompt.0.content", "value": {"stringValue": "Hello..."}},
                    {"key": "gen_ai.prompt.0.role", "value": {"stringValue": "user"}},
                    {"key": "gen_ai.response.model", "value": {"stringValue": "claude-3-5-sonnet-latest"}},
                    {"key": "gen_ai.usage.prompt_tokens", "value": {"intValue": 10}},
                    {"key": "gen_ai.usage.completion_tokens", "value": {"intValue": 20}},
                    {"key": "llm.usage.total_tokens", "value": {"intValue": 30}},
                    {"key": "gen_ai.completion.0.finish_reason", "value": {"stringValue": "end_turn"}},
                    {"key": "gen_ai.completion.0.role", "value": {"stringValue": "assistant"}},
                    {"key": "gen_ai.completion.0.content", "value": {"stringValue": "World!"}},
                ],
            ),
        )
        self.assertEqual(endpoint_mock.call_count, 1)

    def test_success_not_instruments_anthropic(self):
        anthropic, completion = self.create_anthropic_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("anthropic.resources.messages.Messages.create", return_value=completion):
            self.telemetry.uninstrument()
            anthropic.messages.create(
                max_tokens=1000,
                model="claude-3-5-sonnet-latest",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        self.assertEqual(endpoint_mock.call_count, 0)

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
        litellm, completion = self.create_litellm_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("litellm.llms.openai.openai.OpenAIChatCompletion.completion", return_value=completion):
            self.telemetry.instrument([Instrumentors.LiteLLM])
            litellm.completion(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        request, _ = endpoint_mock.calls.last

        self.assert_requested(
            request,
            method="POST",
            endpoint=endpoint,
            body=self.create_instrumentation_request(
                name="completion",
                attributes=[
                    {"key": "llm.model_name", "value": {"stringValue": "gpt-4o-mini"}},
                    {"key": "input.value", "value": {"stringValue": '[{"role": "user", "content": "Hello..."}]'}},
                    {"key": "llm.input_messages.0.message.role", "value": {"stringValue": "user"}},
                    {"key": "llm.input_messages.0.message.content", "value": {"stringValue": "Hello..."}},
                    {"key": "llm.invocation_parameters", "value": {"stringValue": "{}"}},
                    {"key": "output.value", "value": {"stringValue": "World!"}},
                    {"key": "llm.token_count.prompt", "value": {"intValue": 10}},
                    {"key": "llm.token_count.completion", "value": {"intValue": 20}},
                    {"key": "llm.token_count.total", "value": {"intValue": 30}},
                    {"key": "openinference.span.kind", "value": {"stringValue": "LLM"}},
                ],
            ),
        )
        self.assertEqual(endpoint_mock.call_count, 1)

    def test_success_not_instruments_litellm(self):
        litellm, completion = self.create_litellm_mock()
        endpoint = "/otlp/v1/traces"
        endpoint_mock = self.gateway_mock.post(endpoint).mock()

        with mock.patch("litellm.llms.openai.openai.OpenAIChatCompletion.completion", return_value=completion):
            self.telemetry.uninstrument()
            litellm.completion(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        self.assertEqual(endpoint_mock.call_count, 0)
