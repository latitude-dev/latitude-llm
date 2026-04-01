"""
Span type definitions and specifications for Latitude telemetry.
Mirrors the TypeScript implementation in @latitude-data/constants.
"""

from enum import Enum
from typing import Dict, NamedTuple


class SpanKind(str, Enum):
    """OpenTelemetry span kinds."""

    Internal = "internal"
    Server = "server"
    Client = "client"
    Producer = "producer"
    Consumer = "consumer"


class SpanType(str, Enum):
    """
    Span types for Latitude telemetry.
    Based on OpenTelemetry GenAI semantic conventions.
    """

    # Latitude wrappers
    Prompt = "prompt"  # Running a prompt
    Chat = "chat"  # Continuing a conversation
    External = "external"  # Wrapping external generation code
    UnresolvedExternal = "unresolved_external"  # External span needing resolution

    # HTTP span for raw requests
    Http = "http"

    # Standard AI operation types
    Completion = "completion"
    Tool = "tool"
    Embedding = "embedding"

    # Unknown/other
    Unknown = "unknown"


class SpanStatus(str, Enum):
    """OpenTelemetry span status codes."""

    Unset = "unset"
    Ok = "ok"
    Error = "error"


class SpanSpecification(NamedTuple):
    """Specification for a span type."""

    name: str
    description: str
    isGenAI: bool
    isHidden: bool


SPAN_SPECIFICATIONS: Dict[SpanType, SpanSpecification] = {
    SpanType.Prompt: SpanSpecification(
        name="Prompt",
        description="A prompt span",
        isGenAI=False,
        isHidden=False,
    ),
    SpanType.Chat: SpanSpecification(
        name="Chat",
        description="A chat continuation span",
        isGenAI=False,
        isHidden=False,
    ),
    SpanType.External: SpanSpecification(
        name="External",
        description="An external capture span",
        isGenAI=False,
        isHidden=False,
    ),
    SpanType.UnresolvedExternal: SpanSpecification(
        name="Unresolved External",
        description="An external span that needs path resolution before storage",
        isGenAI=False,
        isHidden=True,
    ),
    SpanType.Completion: SpanSpecification(
        name="Completion",
        description="A completion call",
        isGenAI=True,
        isHidden=False,
    ),
    SpanType.Embedding: SpanSpecification(
        name="Embedding",
        description="An embedding call",
        isGenAI=True,
        isHidden=False,
    ),
    SpanType.Tool: SpanSpecification(
        name="Tool",
        description="A tool call",
        isGenAI=True,
        isHidden=False,
    ),
    SpanType.Http: SpanSpecification(
        name="HTTP",
        description="An HTTP request",
        isGenAI=False,
        isHidden=True,
    ),
    SpanType.Unknown: SpanSpecification(
        name="Unknown",
        description="An unknown span",
        isGenAI=False,
        isHidden=True,
    ),
}


class LogSources(str, Enum):
    """Sources of log entries."""

    API = "api"
    Playground = "playground"
    Evaluation = "evaluation"
    SharedPrompt = "shared_prompt"
