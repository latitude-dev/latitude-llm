from latitude_telemetry.util import Model, StrEnum


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


class GatewayOptions(Model):
    """Gateway configuration options."""

    base_url: str

    @property
    def traces_url(self) -> str:
        """URL for the traces endpoint."""
        return f"{self.base_url}/v1/traces"
