"""
Main Latitude Telemetry SDK.
Mirrors the TypeScript LatitudeTelemetry class.
"""

import warnings

# Suppress Pydantic V2 deprecation warnings from OpenTelemetry instrumentation dependencies
warnings.filterwarnings("ignore", message="Valid config keys have changed in V2")

import functools
import inspect
import re
from contextvars import Token
from typing import Any, Callable, Dict, List, Sequence, TypeVar

from opentelemetry import context as otel_context
from opentelemetry.context import Context
from opentelemetry.instrumentation.instrumentor import BaseInstrumentor
from opentelemetry.instrumentation.threading import ThreadingInstrumentor
from opentelemetry.sdk import resources as otel
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor

from latitude_telemetry.constants import DOCUMENT_PATH_REGEXP, InstrumentationScope
from latitude_telemetry.env import env
from latitude_telemetry.exporter import ExporterOptions, create_exporter
from latitude_telemetry.instrumentations import (
    BaseInstrumentation,
    CaptureOptions,
    ManualInstrumentation,
)
from latitude_telemetry.managers import (
    ContextManager,
    InstrumentationManager,
    SpanFactory,
    TracerManager,
)
from latitude_telemetry.telemetry.types import (
    GatewayOptions,
    Instrumentors,
    SpanMetadata,
    SpanPrompt,
    TelemetryAttributes,
)
from latitude_telemetry.util import Model, is_package_installed

TELEMETRY_INSTRUMENTATION_NAME = "opentelemetry.instrumentation.latitude"
SERVICE_NAME = "latitude-telemetry-python"
SCOPE_VERSION = "3.0.0"

_THREADING_INSTRUMENTOR = "Threading"

T = TypeVar("T")


class InternalOptions(Model):
    """Internal gateway and timeout options."""

    gateway: GatewayOptions | None = None
    timeout: float | None = None


class TelemetryOptions(Model):
    """Options for configuring the Telemetry SDK."""

    instrumentors: Sequence[Instrumentors] | None = None
    disable_batch: bool | None = None
    internal: InternalOptions | None = None


DEFAULT_INTERNAL_OPTIONS = InternalOptions(
    gateway=GatewayOptions(base_url=env.GATEWAY_BASE_URL),
    timeout=30,
)


DEFAULT_TELEMETRY_OPTIONS = TelemetryOptions(
    instrumentors=[],  # NOTE: Instrumentation is opt-in
    disable_batch=False,
    internal=DEFAULT_INTERNAL_OPTIONS,
)


class BadRequestError(Exception):
    """Error raised for invalid requests."""

    pass


class CaptureContext:
    """
    Context that can be used as both a decorator and a context manager for capturing telemetry.

    As a decorator (recommended):
        @telemetry.capture(project_id=123, path="my-feature")
        def my_function(input: str) -> str:
            # Your LLM-powered code here
            return result

    As a context manager:
        with telemetry.capture(project_id=123, path="my-feature"):
            # Your LLM-powered code here
            result = ...

    Works with both sync and async functions/contexts.
    """

    def __init__(
        self,
        telemetry: "Telemetry",
        path: str,
        project_id: int,
        version_uuid: str | None = None,
        conversation_uuid: str | None = None,
    ):
        self._telemetry = telemetry
        self._path = path
        self._project_id = project_id
        self._version_uuid = version_uuid
        self._conversation_uuid = conversation_uuid
        self._span: Any | None = None
        self._token: Token[Context] | None = None

    def _validate_path(self) -> None:
        """Validate the path format."""
        if not re.match(DOCUMENT_PATH_REGEXP, self._path):
            raise BadRequestError("Invalid path, no spaces. Only letters, numbers, '.', '-' and '_'")

    def _start_span(self) -> None:
        """Start the capture span and set it as the active context."""
        self._validate_path()
        options = CaptureOptions(
            path=self._path,
            projectId=self._project_id,
            versionUuid=self._version_uuid,
            conversationUuid=self._conversation_uuid,
        )
        self._span = self._telemetry._manual_instrumentation.unresolved_external(otel_context.get_current(), options)
        # Set the span context as active so child spans are properly parented
        self._token = otel_context.attach(self._span.context)

    def _end_span(self, error: Exception | None = None) -> None:
        """End the capture span and restore the previous context.

        Note: Spans are batched and sent automatically by the BatchSpanProcessor.
        Call `telemetry.flush()` explicitly if you need to ensure spans are sent immediately.
        """
        # Detach the context token first to restore the previous context
        if self._token is not None:
            otel_context.detach(self._token)
            self._token = None
        if self._span:
            if error is not None:
                self._span.fail(error, None)
            else:
                self._span.end(None)

    def _create_new_context(self) -> "CaptureContext":
        """Create a new CaptureContext with the same configuration for each invocation."""
        return CaptureContext(
            telemetry=self._telemetry,
            path=self._path,
            project_id=self._project_id,
            version_uuid=self._version_uuid,
            conversation_uuid=self._conversation_uuid,
        )

    def __call__(self, fn: Callable[..., T]) -> Callable[..., T]:
        """Act as a decorator for both sync and async functions, including generators."""
        if inspect.isasyncgenfunction(fn):

            @functools.wraps(fn)
            async def async_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = self._create_new_context()
                ctx._start_span()
                error: Exception | None = None
                try:
                    async for item in fn(*args, **kwargs):
                        yield item
                except Exception as e:
                    error = e
                    raise
                finally:
                    ctx._end_span(error)

            return async_gen_wrapper  # type: ignore[return-value]

        elif inspect.isgeneratorfunction(fn):

            @functools.wraps(fn)
            def sync_gen_wrapper(*args: Any, **kwargs: Any) -> Any:
                ctx = self._create_new_context()
                ctx._start_span()
                error: Exception | None = None
                try:
                    yield from fn(*args, **kwargs)
                except Exception as e:
                    error = e
                    raise
                finally:
                    ctx._end_span(error)

            return sync_gen_wrapper  # type: ignore[return-value]

        elif inspect.iscoroutinefunction(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> T:
                ctx = self._create_new_context()
                ctx._start_span()
                error: Exception | None = None
                try:
                    return await fn(*args, **kwargs)
                except Exception as e:
                    error = e
                    raise
                finally:
                    ctx._end_span(error)

            return async_wrapper  # type: ignore[return-value]
        else:

            @functools.wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> T:
                ctx = self._create_new_context()
                ctx._start_span()
                error: Exception | None = None
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    error = e
                    raise
                finally:
                    ctx._end_span(error)

            return sync_wrapper  # type: ignore[return-value]

    def __enter__(self) -> "CaptureContext":
        """Enter the sync context manager."""
        self._start_span()
        return self

    def __exit__(
        self,
        exc_type: type | None,
        exc_val: Exception | None,
        exc_tb: Any | None,
    ) -> bool:
        """Exit the sync context manager."""
        self._end_span(exc_val)
        return False  # Don't suppress exceptions

    async def __aenter__(self) -> "CaptureContext":
        """Enter the async context manager."""
        self._start_span()
        return self

    async def __aexit__(
        self,
        exc_type: type | None,
        exc_val: Exception | None,
        exc_tb: Any | None,
    ) -> bool:
        """Exit the async context manager."""
        self._end_span(exc_val)
        return False  # Don't suppress exceptions


class Telemetry:
    """
    Main Latitude Telemetry SDK.

    This class provides the primary interface for sending telemetry data
    to Latitude. It supports automatic instrumentation of various AI providers
    and frameworks, as well as manual span creation.

    Example:
        telemetry = Telemetry(api_key="your-api-key")

        # Using automatic instrumentation
        with telemetry.span("my-operation"):
            # Your code here
            pass

        # Using manual spans
        span = telemetry.span.completion(StartCompletionSpanOptions(
            provider="openai",
            model="gpt-4",
        ))
        try:
            # Make API call
            span.end()
        except Exception as e:
            span.fail(e)
    """

    _options: TelemetryOptions
    _tracer_provider: TracerProvider
    _instrumentors: Dict[Instrumentors | str, BaseInstrumentor]
    _instrumentations_list: List[BaseInstrumentation]
    _manual_instrumentation: ManualInstrumentation

    # Public API
    span: SpanFactory
    context: ContextManager
    instrumentation: InstrumentationManager
    tracer: TracerManager

    def __init__(self, api_key: str, options: TelemetryOptions | None = None):
        """
        Initialize the Telemetry SDK.

        Args:
            api_key: Your Latitude API key
            options: Optional configuration options
        """
        # Merge options with defaults
        options = TelemetryOptions(**{**dict(DEFAULT_TELEMETRY_OPTIONS), **dict(options or {})})
        options.internal = InternalOptions(**{**dict(DEFAULT_INTERNAL_OPTIONS), **dict(options.internal or {})})
        self._options = options

        assert self._options.internal is not None
        assert self._options.internal.gateway is not None
        assert self._options.internal.timeout is not None

        # Create exporter
        exporter = create_exporter(
            ExporterOptions(
                api_key=api_key,
                gateway=self._options.internal.gateway,
                timeout=self._options.internal.timeout,
            )
        )

        # Create tracer provider
        self._tracer_provider = TracerProvider(
            resource=otel.Resource.create({otel.SERVICE_NAME: SERVICE_NAME}),
        )

        # Add span processor
        if self._options.disable_batch:
            self._tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))
        else:
            self._tracer_provider.add_span_processor(BatchSpanProcessor(exporter))

        # Initialize managers
        self.tracer = TracerManager(self._tracer_provider, SCOPE_VERSION)

        # Initialize instrumentors and instrumentations
        self._init_instrumentors()
        self._init_instrumentations()

        # Enable all instrumentations
        self.instrumentation.enable()

        # Automatically instrument providers specified in options
        if self._options.instrumentors:
            self.instrument(self._options.instrumentors)

    def _init_instrumentors(self) -> None:
        """Initialize all available provider instrumentors."""
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

        if is_package_installed("crewai"):
            from opentelemetry.instrumentation.crewai import CrewAIInstrumentor

            self._instrumentors[Instrumentors.CrewAI] = CrewAIInstrumentor()

        if is_package_installed("dspy") or is_package_installed("dspy-ai") or is_package_installed("dsp"):
            from openinference.instrumentation.dspy import DSPyInstrumentor

            self._instrumentors[Instrumentors.DSPy] = DSPyInstrumentor()

        if is_package_installed("google-genai"):
            from opentelemetry.instrumentation.google_generativeai import (
                GoogleGenerativeAiInstrumentor,
            )

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

    def _init_instrumentations(self) -> None:
        """Initialize manual and custom instrumentations."""
        self._instrumentations_list = []

        # Create manual instrumentation
        tracer = self.tracer.get(InstrumentationScope.Manual.value)
        self._manual_instrumentation = ManualInstrumentation(tracer)
        self._instrumentations_list.append(self._manual_instrumentation)

        # Create public API managers
        self.span = SpanFactory(self._manual_instrumentation)
        self.context = ContextManager(self._manual_instrumentation)
        self.instrumentation = InstrumentationManager(self._instrumentations_list)

    def instrument(self, instrumentors: Sequence[Instrumentors] | None = None) -> None:
        """
        Enable specified instrumentors.

        Args:
            instrumentors: List of instrumentors to enable. If None, uses the
                          instrumentors specified in options.
        """
        enabled_instrumentors = [
            _THREADING_INSTRUMENTOR,
            *(instrumentors or self._options.instrumentors or []),
        ]

        for instrumentor in enabled_instrumentors:
            if (
                instrumentor in self._instrumentors
                and not self._instrumentors[instrumentor].is_instrumented_by_opentelemetry
            ):
                self._instrumentors[instrumentor].instrument(tracer_provider=self._tracer_provider)

    def uninstrument(self) -> None:
        """Disable all instrumentors."""
        for instrumentor in self._instrumentors.values():
            if instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.uninstrument()

    def flush(self) -> None:
        """Force flush all pending spans."""
        self._tracer_provider.force_flush()

    def shutdown(self) -> None:
        """Shutdown the telemetry SDK."""
        self._tracer_provider.shutdown()

    def capture(
        self,
        path: str,
        project_id: int,
        version_uuid: str | None = None,
        conversation_uuid: str | None = None,
    ) -> CaptureContext:
        """
        Capture a feature execution with telemetry.

        Can be used as a decorator (recommended) or as a context manager.
        Works with both sync and async functions/contexts.

        Args:
            path: The path to identify this prompt in Latitude (e.g., "generate-support-reply").
                  Should not contain spaces. Only letters, numbers, '-', '_', '/', '.' allowed.
            project_id: The ID of your project in Latitude.
            version_uuid: Optional version UUID for the prompt.
            conversation_uuid: Optional conversation UUID for multi-turn conversations.

        Returns:
            A CaptureContext that can be used as a decorator or context manager.

        Raises:
            BadRequestError: If the path is invalid.

        Example (decorator - recommended):
            @telemetry.capture(project_id=123, path="generate-support-reply")
            def generate_support_reply(input: str) -> str:
                # Your LLM-powered code here
                response = openai.chat.completions.create(...)
                return response.choices[0].message.content

        Example (context manager):
            def generate_support_reply(input: str) -> str:
                with telemetry.capture(project_id=123, path="generate-support-reply"):
                    # Your LLM-powered code here
                    response = openai.chat.completions.create(...)
                    return response.choices[0].message.content

        Example (async decorator):
            @telemetry.capture(project_id=123, path="generate-support-reply")
            async def generate_support_reply(input: str) -> str:
                response = await openai.chat.completions.create(...)
                return response.choices[0].message.content
        """
        return CaptureContext(
            telemetry=self,
            path=path,
            project_id=project_id,
            version_uuid=version_uuid,
            conversation_uuid=conversation_uuid,
        )

    # Legacy API for backward compatibility

    def legacy_span(
        self,
        name: str,
        prompt: SpanPrompt | None = None,
        distinct_id: str | None = None,
        metadata: SpanMetadata | None = None,
    ) -> Any:
        """
        Create a span using the legacy API.

        DEPRECATED: Use telemetry.span.completion(), telemetry.span.tool(), etc. instead.
        """
        import json
        import warnings

        warnings.warn(
            "telemetry.legacy_span() is deprecated. Use telemetry.span.completion(), "
            "telemetry.span.tool(), etc. instead.",
            DeprecationWarning,
            stacklevel=2,
        )

        attributes: Dict[str, Any] = {}

        if prompt:
            attributes[TelemetryAttributes.Prompt] = prompt.model_dump_json()

        if distinct_id:
            attributes[TelemetryAttributes.DistinctID] = distinct_id

        if metadata:
            attributes[TelemetryAttributes.Metadata] = json.dumps(metadata)

        tracer = self._tracer_provider.get_tracer(TELEMETRY_INSTRUMENTATION_NAME)
        return tracer.start_as_current_span(name, attributes=attributes)  # type: ignore[return-value]
