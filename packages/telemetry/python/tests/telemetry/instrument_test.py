"""Tests for LLM instrumentation registration."""

from datetime import datetime
from unittest import mock

import openai as openai_module
from openai import OpenAI
from openai.types.chat import ChatCompletion as OpenAIChatCompletion
from openai.types.chat import ChatCompletionMessage as OpenAIChatCompletionMessage
from openai.types.chat.chat_completion import Choice as OpenAIChoice
from openai.types.completion_usage import CompletionUsage as OpenAICompletionUsage

from latitude_telemetry import register_latitude_instrumentations
from tests.utils import TestCase


class TestInstrument(TestCase):
    def create_openai_mock(self):
        client = OpenAI(api_key="fake-api-key")

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

        return client, completion

    def test_success_instruments_openai(self):
        """Registering the `openai` integration patches the OpenAI SDK.

        OpenAI uses the OpenInference instrumentor (global, stateful patch). This
        verifies the registration wiring lands the patch; span content/attributes
        are covered by the resolver suite + live e2e traces, not a mock here.
        """
        from openinference.instrumentation.openai import OpenAIInstrumentor

        OpenAIInstrumentor().uninstrument()
        try:
            self.assertFalse(OpenAIInstrumentor()._is_instrumented_by_opentelemetry)
            register_latitude_instrumentations({"openai": openai_module}, self.provider)
            self.assertTrue(OpenAIInstrumentor()._is_instrumented_by_opentelemetry)
        finally:
            OpenAIInstrumentor().uninstrument()

    def test_rejects_legacy_list_form(self):
        """Passing a list (legacy form) raises TypeError with a migration hint."""
        with self.assertRaises(TypeError) as ctx:
            register_latitude_instrumentations(["openai"], self.provider)  # type: ignore[arg-type]
        self.assertIn("must be a dict mapping", str(ctx.exception))

    def test_rejects_unknown_integration_key(self):
        """Passing a key not in the registry raises TypeError naming the supported keys."""
        with self.assertRaises(TypeError) as ctx:
            register_latitude_instrumentations({"nope": openai_module}, self.provider)  # type: ignore[arg-type]
        self.assertIn("unknown integration", str(ctx.exception))
