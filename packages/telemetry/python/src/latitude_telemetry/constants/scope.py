"""
Instrumentation scope definitions for Latitude telemetry.
"""

from enum import Enum

SCOPE_LATITUDE = "so.latitude.instrumentation"


class InstrumentationScope(str, Enum):
    """Instrumentation scope identifiers."""

    Manual = "manual"
    Latitude = "latitude"
    OpenAI = "openai"
    Anthropic = "anthropic"
    Bedrock = "bedrock"
    VertexAI = "vertexai"
    AIPlatform = "aiplatform"
    Cohere = "cohere"
    TogetherAI = "together"
    LlamaIndex = "llamaindex"
    Langchain = "langchain"
    LiteLLM = "litellm"
    Groq = "groq"
    MistralAI = "mistralai"
    Ollama = "ollama"
    GoogleGenerativeAI = "googlegenerativeai"
    DSPy = "dspy"
    Haystack = "haystack"
