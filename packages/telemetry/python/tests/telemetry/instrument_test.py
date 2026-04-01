"""Tests for LLM instrumentation with init_latitude()."""

from datetime import datetime
from unittest import mock

from openai import OpenAI
from openai.types.chat import ChatCompletion as OpenAIChatCompletion
from openai.types.chat import ChatCompletionMessage as OpenAIChatCompletionMessage
from openai.types.chat.chat_completion import Choice as OpenAIChoice
from openai.types.completion_usage import CompletionUsage as OpenAICompletionUsage

from latitude_telemetry import init_latitude, register_latitude_instrumentations
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
            register_latitude_instrumentations(["openai"], self.provider)
            openai.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello..."}],
            )

        spans = self.get_exported_spans()
        self.assertEqual(len(spans), 1)

        span = spans[0]
        self.assert_span_name(span, "openai.chat")
        self.assert_span_has_attribute(span, "gen_ai.system", "OpenAI")
        self.assert_span_has_attribute(span, "gen_ai.request.model", "gpt-4o-mini")
        self.assert_span_has_attribute(span, "gen_ai.response.model", "gpt-4o-mini")
        self.assert_span_has_attribute(span, "gen_ai.usage.input_tokens", 10)
        self.assert_span_has_attribute(span, "gen_ai.usage.output_tokens", 20)
