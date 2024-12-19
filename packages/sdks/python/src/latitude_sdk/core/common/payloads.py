from typing import Any, Dict, Optional, Union

from latitude_sdk.core.common.types import Prompt
from latitude_sdk.util import BaseModel


class PromptRequestParams(BaseModel):
    project_id: int
    version_uuid: Optional[str]


class PromptResponse(Prompt, BaseModel):
    pass


class GetPromptRequestParams(PromptRequestParams, BaseModel):
    path: str


class GetPromptResponse(PromptResponse, BaseModel):
    pass


class RunPromptRequestParams(PromptRequestParams, BaseModel):
    pass


class RunPromptRequestBody(BaseModel):
    path: str
    parameters: Optional[Dict[str, Any]]
    custom_identifier: Optional[str]
    stream: Optional[bool]


class RunPromptResponse(BaseModel):
    pass


RequestParams = Union[GetPromptRequestParams, RunPromptRequestParams]
RequestBody = RunPromptRequestBody
