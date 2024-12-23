from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, Union, runtime_checkable

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


class ContentType(StrEnum):
    Text = "text"
    Image = "image"
    File = "file"
    ToolCall = "tool-call"
    ToolResult = "tool-result"


class TextContent(Model):
    type: ContentType = ContentType.Text
    text: str


class ImageContent(Model):
    type: ContentType = ContentType.Image
    image: str


class FileContent(Model):
    type: ContentType = ContentType.File
    file: str
    mime_type: str = Field(alias=str("mimeType"))


class ToolCallContent(Model):
    type: ContentType = ContentType.ToolCall
    tool_call_id: str = Field(alias=str("toolCallId"))
    tool_name: str = Field(alias=str("toolName"))
    args: Dict[str, Any]


class ToolResultContent(Model):
    type: ContentType = ContentType.ToolResult
    tool_call_id: str = Field(alias=str("toolCallId"))
    tool_name: str = Field(alias=str("toolName"))
    result: str
    is_error: Optional[bool] = Field(None, alias=str("isError"))


MessageContent = Union[
    str,
    List[TextContent],
    List[ImageContent],
    List[FileContent],
    List[ToolCallContent],
    List[ToolResultContent],
]


class MessageRole(StrEnum):
    System = "system"
    User = "user"
    Assistant = "assistant"
    Tool = "tool"


class SystemMessage(Model):
    role: MessageRole = MessageRole.System
    content: Union[str, List[TextContent]]


class UserMessage(Model):
    role: MessageRole = MessageRole.User
    content: Union[str, List[Union[TextContent, ImageContent, FileContent]]]
    name: Optional[str] = None


class ToolCall(Model):
    id: str
    name: str
    arguments: Dict[str, Any]


class AssistantMessage(Model):
    role: MessageRole = MessageRole.Assistant
    content: Union[str, List[Union[TextContent, ToolCallContent]]]
    tool_calls: Optional[List[ToolCall]] = Field(None, alias=str("toolCalls"))


class ToolMessage(Model):
    role: MessageRole = MessageRole.Tool
    content: List[ToolResultContent]


Message = Union[SystemMessage, UserMessage, AssistantMessage, ToolMessage]


class ModelUsage(Model):
    prompt_tokens: int = Field(alias=str("promptTokens"))
    completion_tokens: int = Field(alias=str("completionTokens"))
    total_tokens: int = Field(alias=str("totalTokens"))


class StreamTypes(StrEnum):
    Text = "text"
    Object = "object"


class ChainTextResponse(Model):
    type: StreamTypes = StreamTypes.Text
    text: str
    tool_calls: Optional[List[ToolCall]] = Field(None, alias=str("toolCalls"))
    usage: ModelUsage


class ChainObjectResponse(Model):
    type: StreamTypes = StreamTypes.Object
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
    event: StreamEvents = StreamEvents.Latitude
    type: ChainEvents = ChainEvents.Step
    config: Dict[str, Any]
    is_last_step: bool = Field(alias=str("isLastStep"))
    messages: List[Message]
    uuid: Optional[str] = None


class ChainEventStepCompleted(Model):
    event: StreamEvents = StreamEvents.Latitude
    type: ChainEvents = ChainEvents.StepCompleted
    response: ChainResponse
    uuid: Optional[str] = None


class ChainEventCompleted(Model):
    event: StreamEvents = StreamEvents.Latitude
    type: ChainEvents = ChainEvents.Completed
    config: Dict[str, Any]
    messages: Optional[List[Message]] = None
    object: Optional[Any] = None
    response: ChainResponse
    uuid: Optional[str] = None


class ChainEventError(Model):
    event: StreamEvents = StreamEvents.Latitude
    type: ChainEvents = ChainEvents.Error
    error: ChainError


ChainEvent = Union[ChainEventStep, ChainEventStepCompleted, ChainEventCompleted, ChainEventError]


LatitudeEvent = ChainEvent


class FinishedEvent(Model):
    event: StreamEvents = StreamEvents.Finished
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
    custom_identifier: Optional[str] = Field(None, alias=str("customIdentifier"))
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
    evaluated_provider_log_id: Optional[int] = Field(None, alias=str("evaluatedProviderLogId"))
    evaluation_provider_log_id: Optional[int] = Field(None, alias=str("evaluationProviderLogId"))
    resultable_type: Optional[EvaluationResultType] = Field(None, alias=str("resultableType"))
    resultable_id: Optional[int] = Field(None, alias=str("resultableId"))
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


class SdkOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None


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
