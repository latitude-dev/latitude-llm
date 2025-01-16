import json
from typing import Any, Dict, Optional, Sequence, Union

from opentelemetry.instrumentation.instrumentor import BaseInstrumentor
from opentelemetry.instrumentation.threading import ThreadingInstrumentor
from opentelemetry.sdk import resources as otel
from opentelemetry.sdk.trace import Tracer, TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor

from latitude_telemetry.env import env
from latitude_telemetry.exporter import Exporter, ExporterOptions
from latitude_telemetry.telemetry.types import (
    GatewayOptions,
    Instrumentors,
    SpanMetadata,
    SpanPrompt,
    TelemetryAttributes,
)
from latitude_telemetry.util import Model, is_package_installed, returns_like

TELEMETRY_INSTRUMENTATION_NAME = "opentelemetry.instrumentation.latitude"


_THREADING_INSTRUMENTOR = "Threading"


class InternalOptions(Model):
    gateway: Optional[GatewayOptions] = None
    retries: Optional[int] = None
    delay: Optional[float] = None
    timeout: Optional[float] = None


class TelemetryOptions(Model):
    instrumentors: Optional[Sequence[Instrumentors]] = None
    disable_batch: Optional[bool] = None
    internal: Optional[InternalOptions] = None


DEFAULT_INTERNAL_OPTIONS = InternalOptions(
    gateway=GatewayOptions(
        host=env.GATEWAY_HOSTNAME,
        port=env.GATEWAY_PORT,
        ssl=env.GATEWAY_SSL,
        api_version="v2",
    ),
    retries=3,
    delay=0.5,
    timeout=30,
)


DEFAULT_TELEMETRY_OPTIONS = TelemetryOptions(
    instrumentors=[],  # Note: Instrumentation is opt-in
    disable_batch=False,
    internal=DEFAULT_INTERNAL_OPTIONS,
)


class Telemetry:
    _options: TelemetryOptions
    _exporter: Exporter
    _tracer: TracerProvider
    _instrumentors: Dict[Union[Instrumentors, str], BaseInstrumentor]

    def __init__(self, api_key: str, options: TelemetryOptions):
        options.internal = options.internal or DEFAULT_INTERNAL_OPTIONS
        options.internal = InternalOptions(**{**dict(DEFAULT_INTERNAL_OPTIONS), **dict(options.internal)})
        options = TelemetryOptions(**{**dict(DEFAULT_TELEMETRY_OPTIONS), **dict(options)})

        assert options.internal is not None
        assert options.internal.gateway is not None
        assert options.internal.retries is not None
        assert options.internal.delay is not None
        assert options.internal.timeout is not None

        self._options = options
        self._exporter = Exporter(
            ExporterOptions(
                api_key=api_key,
                gateway=options.internal.gateway,
                retries=options.internal.retries,
                delay=options.internal.delay,
                timeout=options.internal.timeout,
            )
        )
        self._tracer = TracerProvider(
            resource=otel.Resource.create({otel.SERVICE_NAME: __package__ or __name__}),
        )

        if options.disable_batch:
            self._tracer.add_span_processor(SimpleSpanProcessor(self._exporter))
        else:
            self._tracer.add_span_processor(BatchSpanProcessor(self._exporter))

        self._init_instrumentors()
        self.instrument()

    def _init_instrumentors(self):
        self._instrumentors = {}

        # Threading instrumentor makes sure otel context is propagated
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

        if is_package_installed("google-generativeai"):
            from opentelemetry.instrumentation.google_generativeai import GoogleGenerativeAiInstrumentor

            self._instrumentors[Instrumentors.GoogleGenerativeAI] = GoogleGenerativeAiInstrumentor()

        if is_package_installed("groq"):
            from opentelemetry.instrumentation.groq import GroqInstrumentor

            self._instrumentors[Instrumentors.Groq] = GroqInstrumentor(enrich_token_usage=True)

        if is_package_installed("haystack"):
            from opentelemetry.instrumentation.haystack import HaystackInstrumentor

            self._instrumentors[Instrumentors.Haystack] = HaystackInstrumentor()

        if is_package_installed("langchain"):
            from opentelemetry.instrumentation.langchain import LangchainInstrumentor

            self._instrumentors[Instrumentors.Langchain] = LangchainInstrumentor()

        # Note: LiteLLM instrumentor does not work by itself yet, needs the provider instrumentor too
        # https://github.com/Arize-ai/openinference/issues/604
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

            self._instrumentors[Instrumentors.OpenAI] = OpenAIInstrumentor(enrich_token_usage=True)

        if is_package_installed("replicate"):
            from opentelemetry.instrumentation.replicate import ReplicateInstrumentor

            self._instrumentors[Instrumentors.Replicate] = ReplicateInstrumentor()

        if is_package_installed("boto3"):
            from opentelemetry.instrumentation.sagemaker import SageMakerInstrumentor

            self._instrumentors[Instrumentors.Sagemaker] = SageMakerInstrumentor(enrich_token_usage=True)

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

    def instrument(self, instrumentors: Optional[Sequence[Instrumentors]] = None):
        enabled_instrumentors = [_THREADING_INSTRUMENTOR, *(instrumentors or self._options.instrumentors or [])]

        for instrumentor in enabled_instrumentors:
            if (
                instrumentor in self._instrumentors
                and not self._instrumentors[instrumentor].is_instrumented_by_opentelemetry
            ):
                self._instrumentors[instrumentor].instrument(tracer_provider=self._tracer)

    def uninstrument(self):
        for instrumentor in self._instrumentors.values():
            if instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.uninstrument()

    @returns_like(Tracer.start_as_current_span)
    def span(
        self,
        name: str,
        prompt: Optional[SpanPrompt] = None,
        distinct_id: Optional[str] = None,
        metadata: Optional[SpanMetadata] = None,
    ) -> Any:
        attributes = {}

        if prompt:
            attributes[TelemetryAttributes.Prompt] = prompt.model_dump_json()

        if distinct_id:
            attributes[TelemetryAttributes.DistinctID] = distinct_id

        if metadata:
            attributes[TelemetryAttributes.Metadata] = json.dumps(metadata)

        tracer = self._tracer.get_tracer(TELEMETRY_INSTRUMENTATION_NAME)

        return tracer.start_as_current_span(name, attributes=attributes)  # type: ignore
