from typing import Callable, Optional, Tuple

from latitude_sdk.client.payloads import (
    AnnotateEvaluationRequestParams,
    AttachRunRequestParams,
    ChatPromptRequestParams,
    CreateLogRequestParams,
    DeletePromptRequestParams,
    GetAllPromptsRequestParams,
    GetAllVersionsRequestParams,
    GetOrCreatePromptRequestParams,
    GetPromptRequestParams,
    RequestHandler,
    RequestParams,
    RunPromptRequestParams,
    StopRunRequestParams,
)
from latitude_sdk.sdk.types import GatewayOptions
from latitude_sdk.util import Model

HEAD_COMMIT = "live"


class RouterOptions(Model):
    gateway: GatewayOptions


class Router:
    options: RouterOptions

    def __init__(self, options: RouterOptions):
        self.options = options

    def resolve(self, handler: RequestHandler, params: Optional[RequestParams] = None) -> Tuple[str, str]:
        if handler == RequestHandler.GetPrompt:
            assert isinstance(params, GetPromptRequestParams)

            return "GET", self.prompts(
                project_id=params.project_id,
                version_uuid=params.version_uuid,
            ).prompt(params.path)

        if handler == RequestHandler.GetAllPrompts:
            assert isinstance(params, GetAllPromptsRequestParams)

            return (
                "GET",
                self.prompts(
                    project_id=params.project_id,
                    version_uuid=params.version_uuid,
                ).all_prompts,
            )

        elif handler == RequestHandler.GetOrCreatePrompt:
            assert isinstance(params, GetOrCreatePromptRequestParams)

            return (
                "POST",
                self.prompts(
                    project_id=params.project_id,
                    version_uuid=params.version_uuid,
                ).get_or_create,
            )

        elif handler == RequestHandler.DeletePrompt:
            assert isinstance(params, DeletePromptRequestParams)

            return (
                "DELETE",
                self.prompts(
                    project_id=params.project_id,
                    version_uuid=params.version_uuid,
                ).prompt(params.path),
            )

        elif handler == RequestHandler.RunPrompt:
            assert isinstance(params, RunPromptRequestParams)

            return (
                "POST",
                self.prompts(
                    project_id=params.project_id,
                    version_uuid=params.version_uuid,
                ).run,
            )

        elif handler == RequestHandler.ChatPrompt:
            assert isinstance(params, ChatPromptRequestParams)

            return "POST", self.conversations().chat(params.conversation_uuid)

        elif handler == RequestHandler.AttachRun:
            assert isinstance(params, AttachRunRequestParams)

            return "POST", self.conversations().attach(params.conversation_uuid)

        elif handler == RequestHandler.StopRun:
            assert isinstance(params, StopRunRequestParams)

            return "POST", self.conversations().stop(params.conversation_uuid)

        elif handler == RequestHandler.CreateLog:
            assert isinstance(params, CreateLogRequestParams)

            return (
                "POST",
                self.prompts(
                    project_id=params.project_id,
                    version_uuid=params.version_uuid,
                ).logs,
            )

        elif handler == RequestHandler.AnnotateEvaluation:
            assert isinstance(params, AnnotateEvaluationRequestParams)

            return "POST", self.conversations().annotate(params.conversation_uuid, params.evaluation_uuid)

        elif handler == RequestHandler.ToolResults:
            return "POST", f"{self.options.gateway.base_url}/tools/results"

        elif handler == RequestHandler.GetAllProjects:
            return "GET", f"{self.options.gateway.base_url}/projects"

        elif handler == RequestHandler.CreateProject:
            return "POST", f"{self.options.gateway.base_url}/projects"

        elif handler == RequestHandler.GetAllVersions:
            assert isinstance(params, GetAllVersionsRequestParams)
            return "GET", f"{self.options.gateway.base_url}/projects/{params.project_id}/versions"

        raise TypeError(f"Unknown handler: {handler}")

    class Conversations(Model):
        chat: Callable[[str], str]
        attach: Callable[[str], str]
        stop: Callable[[str], str]
        annotate: Callable[[str, str], str]

    def conversations(self) -> Conversations:
        base_url = f"{self.options.gateway.base_url}/conversations"

        return self.Conversations(
            chat=lambda uuid: f"{base_url}/{uuid}/chat",
            attach=lambda uuid: f"{base_url}/{uuid}/attach",
            stop=lambda uuid: f"{base_url}/{uuid}/stop",
            annotate=lambda uuid, evaluation_uuid: f"{base_url}/{uuid}/evaluations/{evaluation_uuid}/annotate",
        )

    class Prompts(Model):
        prompt: Callable[[str], str]
        all_prompts: str
        get_or_create: str
        run: str
        logs: str

    def prompts(self, project_id: int, version_uuid: Optional[str]) -> Prompts:
        base_url = f"{self.commits_url(project_id, version_uuid)}/documents"

        return self.Prompts(
            all_prompts=f"{base_url}",
            prompt=lambda path: f"{base_url}/{path}",
            get_or_create=f"{base_url}/get-or-create",
            run=f"{base_url}/run",
            logs=f"{base_url}/logs",
        )

    def commits_url(self, project_id: int, version_uuid: Optional[str]) -> str:
        version_uuid = version_uuid if version_uuid else HEAD_COMMIT

        return f"{self.projects_url(project_id)}/versions/{version_uuid}"

    def projects_url(self, project_id: int) -> str:
        return f"{self.options.gateway.base_url}/projects/{project_id}"
