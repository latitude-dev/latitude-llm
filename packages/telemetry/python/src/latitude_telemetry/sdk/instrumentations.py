"""
LLM instrumentation registration for Latitude Telemetry SDK.
"""

import logging
from typing import cast

from opentelemetry.sdk.trace import TracerProvider

from latitude_telemetry.sdk.types import InstrumentationType
from latitude_telemetry.util import is_package_installed

logger = logging.getLogger(__name__)

# Instrumentation config type
InstrConfig = dict[str, object]

INSTRUMENTATION_MAP: dict[InstrumentationType, InstrConfig] = {
    "openai": {
        "module": "opentelemetry.instrumentation.openai",
        "class": "OpenAIInstrumentor",
        "package": "openai",
        "manual": False,
    },
    "anthropic": {
        "module": "opentelemetry.instrumentation.anthropic",
        "class": "AnthropicInstrumentor",
        "package": "anthropic",
        "manual": True,
    },
    "bedrock": {
        "module": "opentelemetry.instrumentation.bedrock",
        "class": "BedrockInstrumentor",
        "package": "boto3",
        "manual": True,
    },
    "cohere": {
        "module": "opentelemetry.instrumentation.cohere",
        "class": "CohereInstrumentor",
        "package": "cohere",
        "manual": True,
    },
    "langchain": {
        "module": "opentelemetry.instrumentation.langchain",
        "class": "LangchainInstrumentor",
        "package": "langchain-core",
        "manual": True,
    },
    "llamaindex": {
        "module": "opentelemetry.instrumentation.llamaindex",
        "class": "LlamaIndexInstrumentor",
        "package": "llama-index",
        "manual": True,
    },
    "togetherai": {
        "module": "opentelemetry.instrumentation.together",
        "class": "TogetherAiInstrumentor",
        "package": "together",
        "manual": True,
    },
    "vertexai": {
        "module": "opentelemetry.instrumentation.vertexai",
        "class": "VertexAIInstrumentor",
        "package": "google-cloud-aiplatform",
        "manual": True,
    },
    "aiplatform": {
        "module": "opentelemetry.instrumentation.vertexai",
        "class": "AIPlatformInstrumentor",
        "package": "google-cloud-aiplatform",
        "manual": True,
    },
}


def register_latitude_instrumentations(
    instrumentations: list[InstrumentationType],
    tracer_provider: TracerProvider,
) -> None:
    """
    Register LLM instrumentations with the given tracer provider.

    Args:
        instrumentations: List of instrumentation types to enable
        tracer_provider: The tracer provider to register instrumentations with

    Example:
        register_latitude_instrumentations(
            instrumentations=["openai", "anthropic"],
            tracer_provider=provider,
        )
    """
    for inst_type in instrumentations:
        try:
            config: dict[str, object] | None = INSTRUMENTATION_MAP.get(inst_type)
            if not config:
                logger.warning(f"Unknown instrumentation type: {inst_type}")
                continue

            package_name = cast(str, config["package"])
            if not is_package_installed(package_name):
                logger.warning(
                    f"Package '{package_name}' is not installed. Install it to use the {inst_type} instrumentation."
                )
                continue

            try:
                module_name = cast(str, config["module"])
                class_name = cast(str, config["class"])
                module = __import__(module_name, fromlist=[class_name])
                instrumentor_class = getattr(module, class_name)
            except (ImportError, AttributeError) as e:
                logger.warning(f"Failed to import {inst_type} instrumentation: {e}")
                continue

            try:
                instrumentor = instrumentor_class()

                is_manual: bool = config.get("manual")  # type: ignore[assignment]
                if is_manual:
                    package_module_name = cast(str, config["package"])
                    package_module = __import__(package_module_name)
                    if hasattr(instrumentor, "manually_instrument"):
                        instrumentor.manually_instrument(package_module)
                    elif hasattr(instrumentor, "instrument"):
                        instrumentor.instrument(tracer_provider=tracer_provider)
                else:
                    instrumentor.instrument(tracer_provider=tracer_provider)
            except Exception as e:
                logger.warning(f"Failed to register {inst_type} instrumentation: {e}")
                continue
        except Exception as e:
            logger.warning(f"Unexpected error registering {inst_type} instrumentation: {e}")
            continue
