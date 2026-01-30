from datetime import datetime
from typing import (
    Any,
    List,
    Literal,
    Optional,
    Protocol,
    Sequence,
    Union,
    runtime_checkable,
)

from promptl_ai import Message, MessageLike

from latitude_sdk.sdk.errors import ApiError
from latitude_sdk.util import Adapter, Field, Model, StrEnum


class DbErrorRef(Model):
    entity_uuid: str = Field(alias=str("entityUuid"))
    entity_type: str = Field(alias=str("entityType"))


class Providers(StrEnum):
    OpenAI = "openai"
    Anthropic = "anthropic"
    Groq = "groq"
    Mistral = "mistral"
    Azure = "azure"
    Google = "google"
    GoogleVertex = "google_vertex"
    AnthropicVertex = "anthropic_vertex"
    XAI = "xai"
    AmazonBedrock = "amazon_bedrock"
    DeepSeek = "deepseek"
    Perplexity = "perplexity"
    Custom = "custom"


class ParameterType(StrEnum):
    Text = "text"
    File = "file"
    Image = "image"


class PromptParameter(Model):
    type: ParameterType


class Prompt(Model):
    uuid: str
    path: str
    content: str
    config: dict[str, Any]
    parameters: dict[str, PromptParameter]
    provider: Optional[Providers] = None


# TODO(andres): update this to use the new ModelUsage type from V4
class ModelUsage(Model):
    prompt_tokens: int = Field(alias=str("promptTokens"))
    completion_tokens: int = Field(alias=str("completionTokens"))
    total_tokens: int = Field(alias=str("totalTokens"))


class FinishReason(StrEnum):
    Stop = "stop"
    Length = "length"
    ContentFilter = "content-filter"
    ToolCalls = "tool-calls"
    Error = "error"
    Other = "other"
    Unknown = "unknown"


class ToolCall(Model):
    id: str
    name: str
    arguments: dict[str, Any]


class ToolResult(Model):
    id: str
    name: str
    result: Any
    is_error: Optional[bool] = None


class StreamTypes(StrEnum):
    Text = "text"
    Object = "object"


class BaseChainResponse(Model):
    text: str
    usage: ModelUsage
    document_log_uuid: Optional[str] = Field(default=None, alias=str("documentLogUuid"))
    model: str
    provider: Providers
    cost: float
    input: List[Message]
    output: Optional[List[Any]] = None


class ChainTextResponse(BaseChainResponse, Model):
    type: Literal[StreamTypes.Text] = Field(default=StreamTypes.Text, alias=str("streamType"))
    tool_calls: Optional[List[ToolCall]] = Field(default=None, alias=str("toolCalls"))


class ChainObjectResponse(BaseChainResponse, Model):
    type: Literal[StreamTypes.Object] = Field(default=StreamTypes.Object, alias=str("streamType"))
    object: Any


ChainResponse = Union[ChainTextResponse, ChainObjectResponse]


class ChainError(Model):
    name: str
    message: str
    stack: Optional[str] = None


class StreamEvents(StrEnum):
    Latitude = "latitude-event"
    Provider = "provider-event"


# NOTE: Incomplete list
class ProviderEvents(StrEnum):
    ToolCalled = "tool-call"


# NOTE: Incomplete event
class GenericProviderEvent(Model):
    event: Literal[StreamEvents.Provider] = StreamEvents.Provider


# NOTE: Incomplete event
class ProviderEventToolCalled(GenericProviderEvent, Model):
    id: str = Field(alias=str("toolCallId"))
    name: str = Field(alias=str("toolName"))
    arguments: dict[str, Any] = Field(alias=str("args"))


ProviderEvent = dict[str, Any]


class ChainEvents(StrEnum):
    ChainStarted = "chain-started"
    StepStarted = "step-started"
    ProviderStarted = "provider-started"
    ProviderCompleted = "provider-completed"
    ToolsStarted = "tools-started"
    ToolCompleted = "tool-completed"
    StepCompleted = "step-completed"
    ChainCompleted = "chain-completed"
    ChainError = "chain-error"


class GenericChainEvent(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    timestamp: int
    messages: List[Message]
    uuid: str


class ChainEventChainStarted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ChainStarted] = ChainEvents.ChainStarted


class ChainEventStepStarted(GenericChainEvent, Model):
    type: Literal[ChainEvents.StepStarted] = ChainEvents.StepStarted


class ChainEventProviderStarted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ProviderStarted] = ChainEvents.ProviderStarted
    config: dict[str, Any]


class ChainEventProviderCompleted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ProviderCompleted] = ChainEvents.ProviderCompleted
    token_usage: ModelUsage = Field(alias=str("tokenUsage"))
    finish_reason: FinishReason = Field(alias=str("finishReason"))
    response: ChainResponse


class ChainEventToolsStarted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ToolsStarted] = ChainEvents.ToolsStarted
    tools: List[ToolCall]


class ChainEventToolCompleted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ToolCompleted] = ChainEvents.ToolCompleted


class ChainEventStepCompleted(GenericChainEvent, Model):
    type: Literal[ChainEvents.StepCompleted] = ChainEvents.StepCompleted


class ChainEventChainCompleted(GenericChainEvent, Model):
    type: Literal[ChainEvents.ChainCompleted] = ChainEvents.ChainCompleted
    token_usage: ModelUsage = Field(alias=str("tokenUsage"))
    finish_reason: FinishReason = Field(alias=str("finishReason"))


class ChainEventChainError(GenericChainEvent, Model):
    type: Literal[ChainEvents.ChainError] = ChainEvents.ChainError
    error: ChainError


ChainEvent = Union[
    ChainEventChainStarted,
    ChainEventStepStarted,
    ChainEventProviderStarted,
    ChainEventProviderCompleted,
    ChainEventToolsStarted,
    ChainEventToolCompleted,
    ChainEventStepCompleted,
    ChainEventChainCompleted,
    ChainEventChainError,
]

LatitudeEvent = ChainEvent
_LatitudeEvent = Adapter[LatitudeEvent](LatitudeEvent)


class FinishedResult(Model):
    uuid: str
    conversation: List[Message]
    response: ChainResponse


class BackgroundResult(Model):
    uuid: str


StreamEvent = Union[ProviderEvent, LatitudeEvent]


class LogSources(StrEnum):
    Api = "api"
    Playground = "playground"
    Evaluation = "evaluation"
    User = "user"
    SharedPrompt = "shared_prompt"


class Log(Model):
    id: int
    uuid: str
    source: Optional[LogSources] = None
    commit_id: int = Field(alias=str("commitId"))
    resolved_content: str = Field(alias=str("resolvedContent"))
    content_hash: str = Field(alias=str("contentHash"))
    parameters: dict[str, Any]
    custom_identifier: Optional[str] = Field(default=None, alias=str("customIdentifier"))
    duration: Optional[int] = None
    created_at: datetime = Field(alias=str("createdAt"))
    updated_at: datetime = Field(alias=str("updatedAt"))


class EvaluationResult(Model):
    uuid: str
    version_uuid: str = Field(alias=str("versionUuid"))
    score: int
    normalized_score: int = Field(alias=str("normalizedScore"))
    metadata: dict[str, Any]
    has_passed: bool = Field(alias=str("hasPassed"))
    error: Optional[Union[str, None]] = None
    created_at: datetime = Field(alias=str("createdAt"))
    updated_at: datetime = Field(alias=str("updatedAt"))


class Project(Model):
    id: int
    uuid: Optional[str] = None
    name: str
    created_at: datetime = Field(alias=str("createdAt"))
    updated_at: datetime = Field(alias=str("updatedAt"))


class Version(Model):
    id: int
    uuid: str
    title: str
    description: Optional[str] = None
    project_id: int = Field(alias=str("projectId"))
    created_at: datetime = Field(alias=str("createdAt"))
    updated_at: datetime = Field(alias=str("updatedAt"))
    merged_at: Optional[datetime] = Field(default=None, alias=str("mergedAt"))


class StreamCallbacks(Model):
    @runtime_checkable
    class OnEvent(Protocol):
        async def __call__(self, event: StreamEvent): ...

    on_event: Optional[OnEvent] = None

    @runtime_checkable
    class OnFinished(Protocol):
        async def __call__(self, result: FinishedResult): ...

    on_finished: Optional[OnFinished] = None

    @runtime_checkable
    class OnError(Protocol):
        async def __call__(self, error: ApiError): ...

    on_error: Optional[OnError] = None


class OnToolCallDetails(Model):
    id: str
    name: str
    arguments: dict[str, Any]


@runtime_checkable
class OnToolCall(Protocol):
    async def __call__(self, arguments: dict[str, Any], details: OnToolCallDetails) -> Any: ...


@runtime_checkable
class OnStep(Protocol):
    async def __call__(
        self, messages: List[MessageLike], config: dict[str, Any]
    ) -> Union[str, MessageLike, Sequence[MessageLike]]: ...


class SdkOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None
    tools: Optional[dict[str, OnToolCall]] = None


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
