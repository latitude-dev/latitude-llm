"""
LLM instrumentation registration for Latitude Telemetry SDK.

Mirrors the TypeScript SDK's object-form `instrumentations` API: callers pass
a dict mapping integration name → the LLM SDK module they imported in app
code. The registry below resolves each name to the matching OpenTelemetry
instrumentor and hands it the user-supplied module so the patch lands on the
same module instance the app actually uses.
"""

import logging
import os
from dataclasses import dataclass
from typing import Mapping, cast

from opentelemetry.sdk.trace import TracerProvider

from latitude_telemetry.sdk.types import InstrumentationName, InstrumentationsInput

logger = logging.getLogger(__name__)

DOCS_URL = "https://github.com/latitude-dev/latitude-llm/tree/main/packages/telemetry/python#readme"


@dataclass(frozen=True)
class IntegrationDef:
    """One row in the supported-integrations registry."""

    instrumentor_module: str
    """Dotted path to the OpenTelemetry instrumentor module (e.g. `opentelemetry.instrumentation.openai`)."""

    instrumentor_class: str
    """Name of the instrumentor class inside `instrumentor_module`."""

    pypi_dist_name: str
    """PyPI distribution name surfaced in the not-installed warning + pip-install hint."""


INTEGRATIONS: dict[InstrumentationName, IntegrationDef] = {
    "openai": IntegrationDef(
        instrumentor_module="openinference.instrumentation.openai",
        instrumentor_class="OpenAIInstrumentor",
        pypi_dist_name="openai",
    ),
    "openai-agents": IntegrationDef(
        instrumentor_module="openinference.instrumentation.openai_agents",
        instrumentor_class="OpenAIAgentsInstrumentor",
        pypi_dist_name="openai-agents",
    ),
    "anthropic": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.anthropic",
        instrumentor_class="AnthropicInstrumentor",
        pypi_dist_name="anthropic",
    ),
    "bedrock": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.bedrock",
        instrumentor_class="BedrockInstrumentor",
        pypi_dist_name="boto3",
    ),
    "cohere": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.cohere",
        instrumentor_class="CohereInstrumentor",
        pypi_dist_name="cohere",
    ),
    "langchain": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.langchain",
        instrumentor_class="LangchainInstrumentor",
        pypi_dist_name="langchain-core",
    ),
    "llamaindex": IntegrationDef(
        instrumentor_module="openinference.instrumentation.llama_index",
        instrumentor_class="LlamaIndexInstrumentor",
        pypi_dist_name="llama-index",
    ),
    "togetherai": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.together",
        instrumentor_class="TogetherAiInstrumentor",
        pypi_dist_name="together",
    ),
    "vertexai": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.vertexai",
        instrumentor_class="VertexAIInstrumentor",
        pypi_dist_name="google-cloud-aiplatform",
    ),
    "aiplatform": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.vertexai",
        instrumentor_class="AIPlatformInstrumentor",
        pypi_dist_name="google-cloud-aiplatform",
    ),
    "aleph_alpha": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.alephalpha",
        instrumentor_class="AlephAlphaInstrumentor",
        pypi_dist_name="aleph-alpha-client",
    ),
    "crewai": IntegrationDef(
        instrumentor_module="openinference.instrumentation.crewai",
        instrumentor_class="CrewAIInstrumentor",
        pypi_dist_name="crewai",
    ),
    "google_adk": IntegrationDef(
        instrumentor_module="openinference.instrumentation.google_adk",
        instrumentor_class="GoogleADKInstrumentor",
        pypi_dist_name="google-adk",
    ),
    "google_generativeai": IntegrationDef(
        instrumentor_module="openinference.instrumentation.google_genai",
        instrumentor_class="GoogleGenAIInstrumentor",
        pypi_dist_name="google-genai",
    ),
    "groq": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.groq",
        instrumentor_class="GroqInstrumentor",
        pypi_dist_name="groq",
    ),
    "haystack": IntegrationDef(
        instrumentor_module="openinference.instrumentation.haystack",
        instrumentor_class="HaystackInstrumentor",
        pypi_dist_name="haystack-ai",
    ),
    "litellm": IntegrationDef(
        instrumentor_module="litellm.integrations.opentelemetry",
        instrumentor_class="OpenTelemetry",
        pypi_dist_name="litellm",
    ),
    "mistralai": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.mistralai",
        instrumentor_class="MistralAiInstrumentor",
        pypi_dist_name="mistralai",
    ),
    "ollama": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.ollama",
        instrumentor_class="OllamaInstrumentor",
        pypi_dist_name="ollama",
    ),
    "replicate": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.replicate",
        instrumentor_class="ReplicateInstrumentor",
        pypi_dist_name="replicate",
    ),
    "sagemaker": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.sagemaker",
        instrumentor_class="SageMakerInstrumentor",
        pypi_dist_name="boto3",
    ),
    "transformers": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.transformers",
        instrumentor_class="TransformersInstrumentor",
        pypi_dist_name="transformers",
    ),
    "watsonx": IntegrationDef(
        instrumentor_module="opentelemetry.instrumentation.watsonx",
        instrumentor_class="WatsonxInstrumentor",
        pypi_dist_name="ibm-watson-machine-learning",
    ),
}


def _is_plain_dict(value: object) -> bool:
    """A plain dict, not a list, not a string, not a tuple, not None."""
    return isinstance(value, dict)


def _register_litellm_native_otel(litellm_module: object, tracer_provider: TracerProvider) -> None:
    """Register LiteLLM's built-in OpenTelemetry callback on our tracer provider."""
    otel_module = __import__("litellm.integrations.opentelemetry", fromlist=["OpenTelemetry", "OpenTelemetryConfig"])
    OpenTelemetry = otel_module.OpenTelemetry
    OpenTelemetryConfig = otel_module.OpenTelemetryConfig

    os.environ.setdefault("USE_OTEL_LITELLM_REQUEST_SPAN", "true")
    os.environ.setdefault("OTEL_SEMCONV_STABILITY_OPT_IN", "gen_ai_latest_experimental")
    os.environ.setdefault("OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT", "SPAN_ONLY")

    otel_logger = OpenTelemetry(
        config=OpenTelemetryConfig(),
        tracer_provider=tracer_provider,
        callback_name="opentelemetry",
    )

    existing = list(getattr(litellm_module, "callbacks", None) or [])
    if any(isinstance(cb, OpenTelemetry) for cb in existing):
        return
    existing.append(otel_logger)
    litellm_module.callbacks = existing  # type: ignore[attr-defined]


def register_latitude_instrumentations(
    instrumentations: InstrumentationsInput,
    tracer_provider: TracerProvider,
) -> None:
    """
    Register LLM instrumentations with the given tracer provider.

    Args:
        instrumentations: Mapping of integration name → the LLM SDK module the consumer imports
            (e.g. ``{"openai": openai, "anthropic": anthropic}``). Anything other than a plain dict
            (including the legacy list-of-strings form) raises :class:`TypeError` at register time.
        tracer_provider: The tracer provider to register instrumentations with.

    Example:
        import openai
        import anthropic

        register_latitude_instrumentations(
            instrumentations={"openai": openai, "anthropic": anthropic},
            tracer_provider=provider,
        )
    """
    if not _is_plain_dict(instrumentations):
        raise TypeError(
            f"[Latitude] instrumentations must be a dict mapping integration names to LLM SDK modules "
            f"(e.g. {{'openai': openai, 'anthropic': anthropic}}). Received: {instrumentations!r}. "
            f"See {DOCS_URL}."
        )

    typed = cast(Mapping[str, object], instrumentations)
    for raw_name, module in typed.items():
        if module is None:
            continue

        if raw_name not in INTEGRATIONS:
            raise TypeError(
                f"[Latitude] instrumentations: unknown integration {raw_name!r}. "
                f"Expected one of: {', '.join(INTEGRATIONS.keys())}. See {DOCS_URL}."
            )

        name = raw_name
        config = INTEGRATIONS[name]

        # LiteLLM uses its native OTel callback (gen_ai semconv), not an instrumentor.
        if name == "litellm":
            try:
                _register_litellm_native_otel(module, tracer_provider)
            except (ImportError, AttributeError):
                logger.warning(
                    "[Latitude] Instrumentation package not installed for %s: %s. "
                    "Add it as a dependency to enable this instrumentation.",
                    name,
                    config.pypi_dist_name,
                )
            except Exception as e:
                logger.warning("[Latitude] Failed to register %s instrumentation: %s", name, e)
            continue

        try:
            instrumentor_module = __import__(config.instrumentor_module, fromlist=[config.instrumentor_class])
            instrumentor_class = getattr(instrumentor_module, config.instrumentor_class)
        except (ImportError, AttributeError):
            logger.warning(
                "[Latitude] Instrumentation package not installed for %s: %s. "
                "Add it as a dependency to enable this instrumentation.",
                name,
                config.pypi_dist_name,
            )
            continue

        try:
            instrumentor = instrumentor_class()
        except Exception as e:
            logger.warning("[Latitude] Failed to instantiate %s instrumentor: %s", name, e)
            continue

        try:
            # Prefer manually_instrument() when the instrumentor exposes it — that's the
            # path where the user-supplied module reference is actually used. Fall back to
            # the standard instrument(tracer_provider=...) call otherwise.
            if hasattr(instrumentor, "manually_instrument"):
                instrumentor.manually_instrument(module)  # type: ignore[reportUnknownMemberType]
            else:
                instrumentor.instrument(tracer_provider=tracer_provider)  # type: ignore[reportUnknownMemberType]
        except Exception as e:
            logger.warning("[Latitude] Failed to register %s instrumentation: %s", name, e)
            continue
