from typing import Callable, Optional, Tuple

from latitude_sdk.core.common import (
    HEAD_COMMIT,
    GatewayOptions,
    GetPromptRequestParams,
    HandlerType,
    RequestParams,
    RunPromptRequestParams,
)
from latitude_sdk.util import BaseModel, StrEnum


class Http(StrEnum):
    GET = "GET"
    POST = "POST"


class RouterOptions(GatewayOptions, BaseModel):
    pass


class Router:
    options: RouterOptions

    def __init__(self, options: RouterOptions):
        self.options = options

    def resolve(self, handler: HandlerType, params: RequestParams) -> Tuple[str, str]:
        if handler == HandlerType.GET_PROMPT:
            assert isinstance(params, GetPromptRequestParams)

            return Http.GET, self.prompts(
                project_id=params.project_id,
                version_uuid=params.version_uuid,
            ).prompt(params.path)

        elif handler == HandlerType.RUN_PROMPT:
            assert isinstance(params, RunPromptRequestParams)

            return Http.POST, self.prompts(
                project_id=params.project_id,
                version_uuid=params.version_uuid,
            ).run

        raise TypeError(f"Unknown handler: {handler}")

    class Conversations(BaseModel):
        chat: Callable[[str], str]
        evaluate: Callable[[str], str]
        evaluation_result: Callable[[str, str], str]

    def conversations(self) -> Conversations:
        base_url = f"{self.options.base_url}/conversations"

        return self.Conversations(
            chat=lambda uuid: f"{base_url}/{uuid}/chat",
            evaluate=lambda uuid: f"{base_url}/{uuid}/evaluate",
            evaluation_result=lambda conversation_uuid,
            evaluation_uuid: f"{base_url}/{conversation_uuid}/evaluations/{evaluation_uuid}/evaluation-results",
        )

    class Prompts(BaseModel):
        prompt: Callable[[str], str]
        get_or_create: str
        run: str
        logs: str

    def prompts(self, project_id: int, version_uuid: Optional[str]) -> Prompts:
        base_url = f"{self.commits_url(project_id, version_uuid)}/documents"

        return self.Prompts(
            prompt=lambda path: f"{base_url}/{path}",
            get_or_create=f"{base_url}/get-or-create",
            run=f"{base_url}/run",
            logs=f"{base_url}/logs",
        )

    def commits_url(self, project_id: int, version_uuid: Optional[str]) -> str:
        version_uuid = version_uuid if version_uuid else HEAD_COMMIT

        return f"{self.projects_url(project_id)}/versions/{version_uuid}"

    def projects_url(self, project_id: int) -> str:
        return f"{self.options.base_url}/projects/{project_id}"
