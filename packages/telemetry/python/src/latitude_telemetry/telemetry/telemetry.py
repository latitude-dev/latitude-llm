"""
Main Latitude Telemetry SDK.
"""

import warnings

# Suppress Pydantic V2 deprecation warnings from OpenTelemetry instrumentation dependencies
warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")

import functools
import inspect
import json
from contextvars import Token
from typing import Any, Callable, Dict, List, Sequence, TypeVar

from opentelemetry import context as otel_context
from opentelemetry.baggage import set_baggage
from opentelemetry.context import Context
from opentelemetry.instrumentation.instrumentor import BaseInstrumentor
from opentelemetry.instrumentation.threading import ThreadingInstrumentor
from opentelemetry.sdk import resources as otel
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor
from opentelemetry.trace import Tracer

from latitude_telemetry.constants import ATTRIBUTES, SCOPE_LATITUDE
from latitude_telemetry.env import env
from latitude_telemetry.exporter import ExporterOptions, create_exporter
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    CaptureOptions,
    ManualInstrumentation,
)
from latitude_telemetry.telemetry.baggage_span_processor import BaggageSpanProcessor
from latitude_telemetry.telemetry.types import Instrumentors
from latitude_telemetry.util import Model, is_package_installed

SERVICE_NAME = "latitude-telemetry-python"
SCOPE_VERSION = "3.0.0"

_THREADING_INSTRUMENTOR = "Threading"

T = TypeVar("T")


class TelemetryOptions(Model):
    """Options for configuring the Telemetry SDK."""

    instrumentors: Sequence[Instrumentors] | None = None
    disable_batch: bool | None = None


DEFAULT_TELEMETRY_OPTIONS = TelemetryOptions(
    instrumentors=[],
    disable_batch=False,
)


class CaptureContext:
    """
    Context that can be used as both a decorator and a context manager
    to set trace-wide baggage attributes (tags, metadata, session_id, user_id).

    As a decorator:
        @telemetry.capture(tags=["prod"], user_id="user-123")
        def my_function(input: str) -> str:
            response = openai.chat.completions.create(...)
            return response.choices[0].message.content

    As a context manager:
        with telemetry.capture(session_id="session-abc"):
            response = openai.chat.completions.create(...)
    """

    def __init__(self, options: CaptureOptions):
        self._options = options
        self._token: Token[Context] | None = None

    def _start(self) -> None:
        """Set baggage entries as active context."""
        ctx = otel_context.get_current()

        if self._options.tags:
            ctx = set_baggage(ATTRIBUTES.tags, json.dumps(self._options.tags), ctx)

        if self._options.metadata:
            ctx = set_baggage(ATTRIBUTES.metadata, json.dumps(self._options.metadata), ctx)

        if self._options.session_id:
            ctx = set_baggage(ATTRIBUTES.session_id, self._options.session_id, ctx)

        if self._options.user_id:
            ctx = set_baggage(ATTRIBUTES.user_id, self._options.user_id, ctx)

        self._token = otel_context.attach(ctx)

    def _end(self) -> None:
        """Restore the previous context."""
        if self._token is not None:
            otel_context.detach(self._token)
            self._token = None

    def _create_new(self) -> "CaptureContext":
        return CaptureContext(options=self._options)

    def __call__(self, fn: Callable[..., T]) -> Callable[..., T]:
        if inspect.isasyncgenfunction(fn):

            @functools.wraps(fn)
            async def async_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = self._create_new()
                ctx._start()
                try:
                    async for item in fn(*args, **kwargs):
                        yield item
                finally:
                    ctx._end()

            return async_gen_wrapper  # type: ignore[return-value]

        elif inspect.isgeneratorfunction(fn):

            @functools.wraps(fn)
            def sync_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = self._create_new()
                ctx._start()
                try:
                    yield from fn(*args, **kwargs)
                finally:
                    ctx._end()

            return sync_gen_wrapper  # type: ignore[return-value]

        elif inspect.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> T:
                ctx = self._create_new()
                ctx._start()
                try:
                    return await fn(*args, **kwargs)
                finally:
                    ctx._end()

            return async_wrapper  # type: ignore[return-value]
        else:

            @functools.wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> T:
                ctx = self._create_new()
                ctx._start()
                try:
                    return fn(*args, **kwargs)
                finally:
                    ctx._end()

            return sync_wrapper  # type: ignore[return-value]

    def __enter__(self) -> "CaptureContext":
        self._start()
        return self

    def __exit__(self, exc_type: type | None, exc_val: Exception | None, exc_tb: Any | None) -> bool:
        self._end()
        return False

    async def __aenter__(self) -> "CaptureContext":
        self._start()
        return self

    async def __aexit__(self, exc_type: type | None, exc_val: Exception | None, exc_tb: Any | None) -> bool:
        self._end()
        return False


class Telemetry:
    """
    Main Latitude Telemetry SDK.

    Instruments AI provider calls and forwards traces to the Latitude ingest service.

    Example:
        telemetry = Telemetry(api_key="your-api-key", project_slug="my-project")

        # Use capture() to add trace-wide context:
        @telemetry.capture(tags=["prod"], user_id="user-123")
        def my_function():
            client = OpenAI()
            return client.chat.completions.create(...)

        # Use the tracer directly for custom spans:
        with telemetry.tracer.start_as_current_span("my-operation"):
            ...
    """

    _options: TelemetryOptions
    _tracer_provider: TracerProvider
    _instrumentors: Dict[Instrumentors | str, BaseInstrumentor]
    _instrumentations_list: List[BaseInstrumentation]

    tracer: Tracer

    def __init__(self, api_key: str, project_slug: str, options: TelemetryOptions | None = None):
        options = TelemetryOptions(**{**dict(DEFAULT_TELEMETRY_OPTIONS), **dict(options or {})})
        self._options = options

        exporter = create_exporter(
            ExporterOptions(
                api_key=api_key,
                project_slug=project_slug,
                endpoint=env.EXPORTER_URL,
                timeout=30,
            )
        )

        self._tracer_provider = TracerProvider(
            resource=otel.Resource.create({otel.SERVICE_NAME: SERVICE_NAME}),
        )

        self._tracer_provider.add_span_processor(BaggageSpanProcessor())

        if self._options.disable_batch:
            self._tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))
        else:
            self._tracer_provider.add_span_processor(BatchSpanProcessor(exporter))

        manual_tracer = self._tracer_provider.get_tracer(
            f"{SCOPE_LATITUDE}.manual",
            SCOPE_VERSION,
        )
        manual = ManualInstrumentation(manual_tracer)
        self._instrumentations_list = [manual]
        manual.enable()

        self.tracer = manual_tracer

        self._init_instrumentors()

        if self._options.instrumentors:
            self.instrument(self._options.instrumentors)

    def _init_instrumentors(self) -> None:
        self._instrumentors = {}

        self._instrumentors[_THREADING_INSTRUMENTOR] = ThreadingInstrumentor()

        if is_package_installed("aleph_alpha_client"):
            from opentelemetry.instrumentation.alephalpha import AlephAlphaInstrumentor
            self._instrumentors[Instrumentors.AlephAlpha] = AlephAlphaInstrumentor()

        if is_package_installed("anthropic"):
            from opentelemetry.instrumentation.anthropic import AnthropicInstrumentor
            self._instrumentors[Instrumentors.Anthropic] = AnthropicInstrumentor(enrich_token_usage=True)

        if is_package_installed("boto3"):
            from opentelemetry.instrumentation.bedrock import BedrockInstrumentor
            self._instrumentors[Instrumentors.Bedrock] = BedrockInstrumentor(enrich_token_usage=True)

        if is_package_installed("cohere"):
            from opentelemetry.instrumentation.cohere import CohereInstrumentor
            self._instrumentors[Instrumentors.Cohere] = CohereInstrumentor()

        if is_package_installed("crewai"):
            from opentelemetry.instrumentation.crewai import CrewAIInstrumentor
            self._instrumentors[Instrumentors.CrewAI] = CrewAIInstrumentor()

        if is_package_installed("dspy") or is_package_installed("dspy-ai") or is_package_installed("dsp"):
            from openinference.instrumentation.dspy import DSPyInstrumentor
            self._instrumentors[Instrumentors.DSPy] = DSPyInstrumentor()

        if is_package_installed("google-genai"):
            from opentelemetry.instrumentation.google_generativeai import GoogleGenerativeAiInstrumentor
            self._instrumentors[Instrumentors.GoogleGenerativeAI] = GoogleGenerativeAiInstrumentor()

        if is_package_installed("groq"):
            from opentelemetry.instrumentation.groq import GroqInstrumentor
            self._instrumentors[Instrumentors.Groq] = GroqInstrumentor()

        if is_package_installed("haystack"):
            from opentelemetry.instrumentation.haystack import HaystackInstrumentor
            self._instrumentors[Instrumentors.Haystack] = HaystackInstrumentor()

        if is_package_installed("langchain-core"):
            from opentelemetry.instrumentation.langchain import LangchainInstrumentor
            self._instrumentors[Instrumentors.Langchain] = LangchainInstrumentor()

        if is_package_installed("litellm"):
            from openinference.instrumentation.litellm import LiteLLMInstrumentor
            self._instrumentors[Instrumentors.LiteLLM] = LiteLLMInstrumentor()

        if is_package_installed("llama-index") or is_package_installed("llama_index"):
            from opentelemetry.instrumentation.llamaindex import LlamaIndexInstrumentor
            self._instrumentors[Instrumentors.LlamaIndex] = LlamaIndexInstrumentor()

        if is_package_installed("mistralai"):
            from opentelemetry.instrumentation.mistralai import MistralAiInstrumentor
            self._instrumentors[Instrumentors.MistralAI] = MistralAiInstrumentor()

        if is_package_installed("ollama"):
            from opentelemetry.instrumentation.ollama import OllamaInstrumentor
            self._instrumentors[Instrumentors.Ollama] = OllamaInstrumentor()

        if is_package_installed("openai"):
            from opentelemetry.instrumentation.openai import OpenAIInstrumentor
            self._instrumentors[Instrumentors.OpenAI] = OpenAIInstrumentor()

        if is_package_installed("replicate"):
            from opentelemetry.instrumentation.replicate import ReplicateInstrumentor
            self._instrumentors[Instrumentors.Replicate] = ReplicateInstrumentor()

        if is_package_installed("boto3"):
            from opentelemetry.instrumentation.sagemaker import SageMakerInstrumentor
            self._instrumentors[Instrumentors.Sagemaker] = SageMakerInstrumentor()

        if is_package_installed("together"):
            from opentelemetry.instrumentation.together import TogetherAiInstrumentor
            self._instrumentors[Instrumentors.Together] = TogetherAiInstrumentor()

        if is_package_installed("transformers"):
            from opentelemetry.instrumentation.transformers import TransformersInstrumentor
            self._instrumentors[Instrumentors.Transformers] = TransformersInstrumentor()

        if is_package_installed("google-cloud-aiplatform"):
            from opentelemetry.instrumentation.vertexai import VertexAIInstrumentor
            self._instrumentors[Instrumentors.VertexAI] = VertexAIInstrumentor()

        if is_package_installed("ibm-watsonx-ai") or is_package_installed("ibm-watson-machine-learning"):
            from opentelemetry.instrumentation.watsonx import WatsonxInstrumentor
            self._instrumentors[Instrumentors.Watsonx] = WatsonxInstrumentor()

    def instrument(self, instrumentors: Sequence[Instrumentors] | None = None) -> None:
        enabled = [_THREADING_INSTRUMENTOR, *(instrumentors or self._options.instrumentors or [])]
        for name in enabled:
            if name in self._instrumentors and not self._instrumentors[name].is_instrumented_by_opentelemetry:
                self._instrumentors[name].instrument(tracer_provider=self._tracer_provider)

    def uninstrument(self) -> None:
        for instrumentor in self._instrumentors.values():
            if instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.uninstrument()

    def flush(self) -> None:
        self._tracer_provider.force_flush()

    def shutdown(self) -> None:
        self._tracer_provider.shutdown()

    def capture(
        self,
        tags: List[str] | None = None,
        metadata: Dict[str, Any] | None = None,
        session_id: str | None = None,
        user_id: str | None = None,
    ) -> CaptureContext:
        """
        Set trace-wide context attributes on all spans created within the scope.

        Can be used as a decorator or context manager.

        Args:
            tags: Tags to attach to all spans in the trace.
            metadata: Arbitrary metadata to attach to all spans.
            session_id: Session identifier (session.id OTel attribute).
            user_id: User identifier (user.id OTel attribute).
        """
        return CaptureContext(
            options=CaptureOptions(
                tags=tags,
                metadata=metadata,
                session_id=session_id,
                user_id=user_id,
            ),
        )
