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


class GetAllPromptRequestParams(PromptRequestParams, Model):
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
    stream: Optional[bool] = None
    tools: Optional[List[str]] = None


class ChatPromptRequestParams(Model):
    conversation_uuid: str


class ChatPromptRequestBody(Model):
    messages: List[Message]
    stream: Optional[bool] = None


class LogRequestParams(Model):
    project_id: int
    version_uuid: Optional[str] = None


class CreateLogRequestParams(LogRequestParams, Model):
    pass


class CreateLogRequestBody(Model):
    path: str
    messages: List[Message]
    response: Optional[str] = None


class EvaluationRequestParams(Model):
    conversation_uuid: str


class AnnotateEvaluationRequestParams(EvaluationRequestParams, Model):
    evaluation_uuid: str


class AnnotateEvaluationRequestBody(Model):
    score: int

    class Metadata(Model):
        reason: str

    metadata: Optional[Metadata] = None


class ToolResultsRequestBody(Model):
    tool_call_id: str = Field(alias=str("toolCallId"))
    result: Any
    is_error: Optional[bool] = Field(default=None, alias=str("isError"))


class CreateProjectRequestBody(Model):
    name: str


RequestParams = Union[
    GetPromptRequestParams,
    GetAllPromptRequestParams,
    GetOrCreatePromptRequestParams,
    RunPromptRequestParams,
    ChatPromptRequestParams,
    CreateLogRequestParams,
    AnnotateEvaluationRequestParams,
]


RequestBody = Union[
    GetOrCreatePromptRequestBody,
    RunPromptRequestBody,
    ChatPromptRequestBody,
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
    CreateLog = "CREATE_LOG"
    AnnotateEvaluation = "ANNOTATE_EVALUATION"
    ToolResults = "TOOL_RESULTS"
    GetAllProjects = "GET_ALL_PROJECTS"
    CreateProject = "CREATE_PROJECT"
