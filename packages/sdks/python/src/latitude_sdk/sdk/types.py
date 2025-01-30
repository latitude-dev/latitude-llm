from datetime import datetime
from typing import Any, Callable, Dict, List, Literal, Optional, Protocol, Sequence, Union, runtime_checkable

from promptl_ai import Message, MessageLike

from latitude_sdk.sdk.errors import ApiError
from latitude_sdk.util import Field, Model, StrEnum


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
    Custom = "custom"


class Prompt(Model):
    uuid: str
    path: str
    content: str
    config: Dict[str, Any]
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


class ToolCall(Model):
    id: str
    name: str
    arguments: Dict[str, Any]


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
    tool_calls: Optional[List[ToolCall]] = Field(default=None, alias=str("toolCalls"))
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
    Finished = "finished-event"


ProviderEvent = Dict[str, Any]


class ChainEvents(StrEnum):
    Step = "chain-step"
    StepCompleted = "chain-step-complete"
    Completed = "chain-complete"
    Error = "chain-error"


class ChainEventStep(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    type: Literal[ChainEvents.Step] = ChainEvents.Step
    uuid: Optional[str] = None
    is_last_step: bool = Field(alias=str("isLastStep"))
    config: Dict[str, Any]
    messages: List[Message]


class ChainEventStepCompleted(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    type: Literal[ChainEvents.StepCompleted] = ChainEvents.StepCompleted
    uuid: Optional[str] = None
    response: ChainResponse


class ChainEventCompleted(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    type: Literal[ChainEvents.Completed] = ChainEvents.Completed
    uuid: Optional[str] = None
    finish_reason: FinishReason = Field(alias=str("finishReason"))
    config: Dict[str, Any]
    messages: Optional[List[Message]] = None
    object: Optional[Any] = None
    response: ChainResponse


class ChainEventError(Model):
    event: Literal[StreamEvents.Latitude] = StreamEvents.Latitude
    type: Literal[ChainEvents.Error] = ChainEvents.Error
    error: ChainError


ChainEvent = Union[ChainEventStep, ChainEventStepCompleted, ChainEventCompleted, ChainEventError]


LatitudeEvent = ChainEvent


class FinishedEvent(Model):
    event: Literal[StreamEvents.Finished] = StreamEvents.Finished
    uuid: str
    conversation: List[Message]
    response: ChainResponse


StreamEvent = Union[ProviderEvent, LatitudeEvent, FinishedEvent]


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
    parameters: Dict[str, Any]
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
        def __call__(self, event: FinishedEvent): ...

    on_finished: Optional[OnFinished] = None

    @runtime_checkable
    class OnError(Protocol):
        def __call__(self, error: ApiError): ...

    on_error: Optional[OnError] = None


class OnToolCallDetails(Model):
    conversation_uuid: str
    messages: List[Message]
    pause_execution: Callable[[], ToolResult]
    requested_tool_calls: List[ToolCall]


@runtime_checkable
class OnToolCall(Protocol):
    async def __call__(self, call: ToolCall, details: OnToolCallDetails) -> ToolResult: ...


@runtime_checkable
class OnStep(Protocol):
    async def __call__(
        self, messages: List[MessageLike], config: Dict[str, Any]
    ) -> Union[str, MessageLike, Sequence[MessageLike]]: ...


class SdkOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None
    tools: Optional[Dict[str, OnToolCall]] = None


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
