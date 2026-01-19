from typing import Any, Dict, List, Optional, Union

from promptl_ai import Message

from latitude_sdk.sdk.types import DbErrorRef
from latitude_sdk.util import Field, Model, StrEnum


class ErrorResponse(Model):
    name: str
    code: str = Field(alias=str("errorCode"))
    message: str
    details: Dict[str, Any]
    db_ref: Optional[DbErrorRef] = Field(default=None, alias=str("dbErrorRef"))


class PromptRequestParams(Model):
    project_id: int
    version_uuid: Optional[str] = None


class GetPromptRequestParams(PromptRequestParams, Model):
    path: str


class GetAllPromptsRequestParams(PromptRequestParams, Model):
    pass


class GetOrCreatePromptRequestParams(PromptRequestParams, Model):
    pass


class GetOrCreatePromptRequestBody(Model):
    path: str
    prompt: Optional[str] = None


class RunPromptRequestParams(PromptRequestParams, Model):
    pass


class RunPromptRequestBody(Model):
    path: str
    parameters: Optional[Dict[str, Any]] = None
    custom_identifier: Optional[str] = Field(default=None, alias=str("customIdentifier"))
    tools: Optional[List[str]] = None
    stream: Optional[bool] = None
    background: Optional[bool] = None
    mcp_headers: Optional[Dict[str, Dict[str, str]]] = Field(default=None, alias=str("mcpHeaders"))


class ConversationRequestParams(Model):
    conversation_uuid: str


class ChatPromptRequestParams(ConversationRequestParams, Model):
    pass


class ChatPromptRequestBody(Model):
    messages: List[Message]
    tools: Optional[List[str]] = None
    stream: Optional[bool] = None
    mcp_headers: Optional[Dict[str, Dict[str, str]]] = Field(default=None, alias=str("mcpHeaders"))


class AttachRunRequestParams(ConversationRequestParams, Model):
    pass


class AttachRunRequestBody(Model):
    stream: Optional[bool] = None


class StopRunRequestParams(ConversationRequestParams, Model):
    pass


class LogRequestParams(Model):
    project_id: int
    version_uuid: Optional[str] = None


class CreateLogRequestParams(LogRequestParams, Model):
    pass


class CreateLogRequestBody(Model):
    path: str
    messages: List[Message]
    response: Optional[str] = None


class AnnotateEvaluationRequestParams(ConversationRequestParams, Model):
    evaluation_uuid: str


class AnnotateEvaluationRequestBody(Model):
    class Metadata(Model):
        reason: str

    score: int
    metadata: Optional[Metadata] = None


class ToolResultsRequestBody(Model):
    tool_call_id: str = Field(alias=str("toolCallId"))
    result: Any
    is_error: Optional[bool] = Field(default=None, alias=str("isError"))


class CreateProjectRequestBody(Model):
    name: str


class GetAllVersionsRequestParams(Model):
    project_id: int


RequestParams = Union[
    GetPromptRequestParams,
    GetAllPromptsRequestParams,
    GetOrCreatePromptRequestParams,
    RunPromptRequestParams,
    ChatPromptRequestParams,
    AttachRunRequestParams,
    StopRunRequestParams,
    CreateLogRequestParams,
    AnnotateEvaluationRequestParams,
    GetAllVersionsRequestParams,
]


RequestBody = Union[
    GetOrCreatePromptRequestBody,
    RunPromptRequestBody,
    ChatPromptRequestBody,
    AttachRunRequestBody,
    CreateLogRequestBody,
    AnnotateEvaluationRequestBody,
    ToolResultsRequestBody,
    CreateProjectRequestBody,
]


class RequestHandler(StrEnum):
    GetPrompt = "GET_PROMPT"
    GetAllPrompts = "GET_ALL_PROMPTS"
    GetOrCreatePrompt = "GET_OR_CREATE_PROMPT"
    RunPrompt = "RUN_PROMPT"
    ChatPrompt = "CHAT_PROMPT"
    AttachRun = "ATTACH_RUN"
    StopRun = "STOP_RUN"
    CreateLog = "CREATE_LOG"
    AnnotateEvaluation = "ANNOTATE_EVALUATION"
    ToolResults = "TOOL_RESULTS"
    GetAllProjects = "GET_ALL_PROJECTS"
    CreateProject = "CREATE_PROJECT"
    GetAllVersions = "GET_ALL_VERSIONS"
