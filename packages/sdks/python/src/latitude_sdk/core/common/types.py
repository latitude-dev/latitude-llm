from datetime import datetime
from typing import Any, Dict, Optional, Protocol, runtime_checkable

from latitude_sdk.core.common.exceptions import LatitudeException
from latitude_sdk.util import BaseModel, StrEnum


class Providers(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GROQ = "groq"
    MISTRAL = "mistral"
    AZURE = "azure"
    GOOGLE = "google"
    CUSTOM = "custom"


class Prompt(BaseModel):
    id: int
    document_uuid: str
    path: str
    content: str
    resolved_content: str
    content_hash: str
    promptl_version: int
    commit_id: int
    dataset_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime]

    config: Dict[str, Any]
    provider: Optional[Providers]


class LogSources(StrEnum):
    API = "api"
    PLAYGROUND = "playground"
    EVALUATION = "evaluation"


class StreamEvents(StrEnum):
    LATITUDE = "latitude-event"
    PROVIDER = "provider-event"


# TODO
class ProviderEvent(BaseModel):
    pass


# TODO
class LatitudeEvent(BaseModel):
    pass


# TODO
class ChainEvent(BaseModel):
    class Completed(BaseModel):
        pass

    pass


class RequestHandler(StrEnum):
    GET_PROMPT = "get-prompt"
    RUN_PROMPT = "run-prompt"


class EventCallbacks(BaseModel):
    class Config:
        arbitrary_types_allowed = True

    @runtime_checkable
    class OnEvent(Protocol):
        def __call__(self, event: StreamEvents, data: ChainEvent): ...

    on_event: Optional[OnEvent] = None

    @runtime_checkable
    class OnFinished(Protocol):
        # TODO: I dont understand what type is data
        def __call__(self, data: ChainEvent.Completed): ...

    on_finished: Optional[OnFinished] = None

    @runtime_checkable
    class OnError(Protocol):
        def __call__(self, error: LatitudeException): ...

    on_error: Optional[OnError] = None


class GatewayOptions(BaseModel):
    host: str
    port: Optional[int] = None
    ssl: bool
    api_version: str

    @property
    def base_url(self) -> str:
        protocol = "https" if self.ssl else "http"
        domain = f"{self.host}:{self.port}" if self.port else self.host

        return f"{protocol}://{domain}/api/{self.api_version}"


class PromptOptions(BaseModel):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None
