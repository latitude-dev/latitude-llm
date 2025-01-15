from typing import Any, Dict, Optional

from latitude_telemetry.util import Field, Model, StrEnum


class Instrumentors(StrEnum):
    AlephAlpha = "alephalpha"
    Anthropic = "anthropic"
    Bedrock = "bedrock"
    Cohere = "cohere"
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
    version_uuid: Optional[str] = Field(default=None, alias=str("versionUuid"))
    parameters: Optional[Dict[str, Any]] = None


SpanMetadata = Dict[str, Any]


class GatewayOptions(Model):
    host: str
    port: int
    ssl: bool
    api_version: str

    @property
    def protocol(self) -> str:
        return "https" if self.ssl else "http"

    @property
    def base_url(self) -> str:
        return f"{self.protocol}://{self.host}:{self.port}/api/{self.api_version}"
