from typing import Optional, Sequence

from promptl_ai import MessageLike
from promptl_ai.bindings.types import _Message

from latitude_sdk.client import Client, CreateLogRequestBody, CreateLogRequestParams, RequestHandler
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import Log, SdkOptions
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

    def _ensure_log_options(self, options: LogOptions):
        if not options.project_id:
            raise ApiError(
                status=404,
                code=ApiErrorCodes.NotFoundError,
                message="Project ID is required",
                response="Project ID is required",
            )

    async def create(
        self, path: str, messages: Sequence[MessageLike], options: Optional[CreateLogOptions] = None
    ) -> CreateLogResult:
        options = CreateLogOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_log_options(options)
        assert options.project_id is not None

        messages = [_Message.validate_python(message) for message in messages]

        async with self._client.request(
            handler=RequestHandler.CreateLog,
            params=CreateLogRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
            body=CreateLogRequestBody(
                path=path,
                messages=messages,
                response=options.response,
            ),
        ) as response:
            return CreateLogResult.model_validate_json(response.content)
