from typing import Any, Dict

from latitude_telemetry.util import Field, Model, StrEnum


class Instrumentors(StrEnum):
    AlephAlpha = "alephalpha"
    Anthropic = "anthropic"
    Bedrock = "bedrock"
    Cohere = "cohere"
    CrewAI = "crewai"
    DSPy = "dspy"
    GoogleGenerativeAI = "googlegenerativeai"
    Groq = "groq"
    Haystack = "haystack"
    Langchain = "langchain"
    LiteLLM = "litellm"
    LlamaIndex = "llamaindex"
    MistralAI = "mistralai"
    Ollama = "ollama"
    OpenAI = "openai"
    Replicate = "replicate"
    Sagemaker = "sagemaker"
    Together = "together"
    Transformers = "transformers"
    VertexAI = "vertexai"
    Watsonx = "watsonx"


class TelemetryAttributes(StrEnum):
    Root = "latitude"
    Span = f"{Root}.span"
    Prompt = f"{Root}.prompt"
    DistinctID = f"{Root}.distinctId"
    Metadata = f"{Root}.metadata"


class SpanPrompt(Model):
    uuid: str
    version_uuid: str | None = Field(default=None, alias=str("versionUuid"))
    parameters: Dict[str, Any] | None = None


SpanMetadata = Dict[str, Any]


class GatewayOptions(Model):
    """Gateway configuration options."""

    base_url: str

    @property
    def traces_url(self) -> str:
        """URL for the traces endpoint (v3 API)."""
        return f"{self.base_url}/api/v3/traces"
