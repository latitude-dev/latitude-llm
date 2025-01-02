from typing import Iterable, Optional

from latitude_sdk.client import Client, CreateLogRequestBody, CreateLogRequestParams, RequestHandler
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import (
    Log,
    Message,
    SdkOptions,
)
from latitude_sdk.util import Model


class LogOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None


class CreateLogOptions(LogOptions, Model):
    response: Optional[str] = None


class CreateLogResult(Log, Model):
    pass


class Logs:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    def _ensure_options(self, options: LogOptions) -> LogOptions:
        project_id = options.project_id or self._options.project_id
        if not project_id:
            raise ApiError(
                status=404,
                code=ApiErrorCodes.NotFoundError,
                message="Project ID is required",
                response="Project ID is required",
            )

        version_uuid = options.version_uuid or self._options.version_uuid

        return LogOptions(project_id=project_id, version_uuid=version_uuid)

    async def create(self, path: str, messages: Iterable[Message], options: CreateLogOptions) -> CreateLogResult:
        log_options = self._ensure_options(options)
        options = CreateLogOptions(**{**dict(options), **dict(log_options)})

        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.CreateLog,
            params=CreateLogRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
            body=CreateLogRequestBody(
                path=path,
                messages=list(messages),
                response=options.response,
            ),
        ) as response:
            return CreateLogResult.model_validate_json(response.content)
