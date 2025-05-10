from datetime import datetime
from typing import Any, Callable, List, Literal, Optional, Protocol, Sequence, Union, runtime_checkable

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


AGENT_START_TOOL_NAME = "start_autonomous_chain"
AGENT_END_TOOL_NAME = "end_autonomous_chain"


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


class ChainTextResponse(Model):
    type: Literal[StreamTypes.Text] = Field(default=StreamTypes.Text, alias=str("streamType"))
    text: str
    tool_calls: List[ToolCall] = Field(alias=str("toolCalls"))
    usage: ModelUsage


class ChainObjectResponse(Model):
    type: Literal[StreamTypes.Object] = Field(default=StreamTypes.Object, alias=str("streamType"))
    object: Any
    usage: ModelUsage


ChainResponse = Union[ChainTextResponse, ChainObjectResponse]


class ChainError(Model):
    name: str
    message: str
    stack: Optional[str] = None


class StreamEvents(StrEnum):
    Latitude = "latitude-event"
    Provider = "provider-event"


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
    ToolsRequested = "tools-requested"


class GenericChainEvent(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    messages: List[Message]
    uuid: str


class ChainEventChainStarted(GenericChainEvent):
    type: Literal[ChainEvents.ChainStarted] = ChainEvents.ChainStarted


class ChainEventStepStarted(GenericChainEvent):
    type: Literal[ChainEvents.StepStarted] = ChainEvents.StepStarted


class ChainEventProviderStarted(GenericChainEvent):
    type: Literal[ChainEvents.ProviderStarted] = ChainEvents.ProviderStarted
    config: dict[str, Any]


class ChainEventProviderCompleted(GenericChainEvent):
    type: Literal[ChainEvents.ProviderCompleted] = ChainEvents.ProviderCompleted
    provider_log_uuid: str = Field(alias=str("providerLogUuid"))
    token_usage: ModelUsage = Field(alias=str("tokenUsage"))
    finish_reason: FinishReason = Field(alias=str("finishReason"))
    response: ChainResponse


class ChainEventToolsStarted(GenericChainEvent):
    type: Literal[ChainEvents.ToolsStarted] = ChainEvents.ToolsStarted
    tools: List[ToolCall]


class ChainEventToolCompleted(GenericChainEvent):
    type: Literal[ChainEvents.ToolCompleted] = ChainEvents.ToolCompleted


class ChainEventStepCompleted(GenericChainEvent):
    type: Literal[ChainEvents.StepCompleted] = ChainEvents.StepCompleted


class ChainEventChainCompleted(GenericChainEvent):
    type: Literal[ChainEvents.ChainCompleted] = ChainEvents.ChainCompleted
    token_usage: ModelUsage = Field(alias=str("tokenUsage"))
    finish_reason: FinishReason = Field(alias=str("finishReason"))


class ChainEventChainError(GenericChainEvent):
    type: Literal[ChainEvents.ChainError] = ChainEvents.ChainError
    error: ChainError


class ChainEventToolsRequested(GenericChainEvent):
    type: Literal[ChainEvents.ToolsRequested] = ChainEvents.ToolsRequested
    tools: List[ToolCall]


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
    ChainEventToolsRequested,
]

LatitudeEvent = ChainEvent
_LatitudeEvent = Adapter[LatitudeEvent](LatitudeEvent)


class FinishedResult(Model):
    uuid: str
    conversation: List[Message]
    response: ChainResponse
    agent_response: Optional[dict[str, Any]] = Field(default=None, alias=str("agentResponse"))
    tool_requests: List[ToolCall] = Field(alias=str("toolRequests"))


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


class EvaluationResultType(StrEnum):
    Boolean = "evaluation_resultable_booleans"
    Text = "evaluation_resultable_texts"
    Number = "evaluation_resultable_numbers"


class EvaluationResult(Model):
    id: int
    uuid: str
    evaluation_id: int = Field(alias=str("evaluationId"))
    document_log_id: int = Field(alias=str("documentLogId"))
    evaluated_provider_log_id: Optional[int] = Field(default=None, alias=str("evaluatedProviderLogId"))
    evaluation_provider_log_id: Optional[int] = Field(default=None, alias=str("evaluationProviderLogId"))
    resultable_type: Optional[EvaluationResultType] = Field(default=None, alias=str("resultableType"))
    resultable_id: Optional[int] = Field(default=None, alias=str("resultableId"))
    result: Optional[Union[str, bool, int]] = None
    source: Optional[LogSources] = None
    reason: Optional[str] = None
    created_at: datetime = Field(alias=str("createdAt"))
    updated_at: datetime = Field(alias=str("updatedAt"))


class StreamCallbacks(Model):
    @runtime_checkable
    class OnEvent(Protocol):
        def __call__(self, event: StreamEvent): ...

    on_event: Optional[OnEvent] = None

    @runtime_checkable
    class OnFinished(Protocol):
        def __call__(self, result: FinishedResult): ...

    on_finished: Optional[OnFinished] = None

    @runtime_checkable
    class OnError(Protocol):
        def __call__(self, error: ApiError): ...

    on_error: Optional[OnError] = None


class OnToolCallDetails(Model):
    id: str
    name: str
    conversation_uuid: str
    messages: List[Message]
    pause_execution: Callable[[], ToolResult]
    requested_tool_calls: List[ToolCall]


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
