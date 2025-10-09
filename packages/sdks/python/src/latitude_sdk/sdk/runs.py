from typing import Optional

from latitude_sdk.client import (
    AttachRunRequestBody,
    AttachRunRequestParams,
    Client,
    RequestHandler,
    StopRunRequestParams,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.stream import Streamer
from latitude_sdk.sdk.types import (
    FinishedResult,
    OnToolCall,
    SdkOptions,
    StreamCallbacks,
)
from latitude_sdk.util import Model


class AttachRunOptions(StreamCallbacks, Model):
    tools: Optional[dict[str, OnToolCall]] = None
    stream: Optional[bool] = True  # Note: making stream the default


class AttachRunResult(FinishedResult, Model):
    pass


class Runs:
    _options: SdkOptions
    _client: Client
    _streamer: Streamer

    def __init__(self, client: Client, streamer: Streamer, options: SdkOptions):
        self._options = options
        self._client = client
        self._streamer = streamer

    async def attach(self, uuid: str, options: Optional[AttachRunOptions] = None) -> Optional[AttachRunResult]:
        options = AttachRunOptions(**{**dict(self._options), **dict(options or {})})

        try:
            async with self._client.request(
                handler=RequestHandler.AttachRun,
                params=AttachRunRequestParams(
                    conversation_uuid=uuid,
                ),
                body=AttachRunRequestBody(
                    stream=options.stream,
                ),
                stream=options.stream,
            ) as response:
                if options.stream:
                    result = await self._streamer.handle(response.sse(), options.on_event, options.tools)
                else:
                    result = FinishedResult.model_validate_json(response.content)

            if options.on_finished:
                await options.on_finished(result)

            return AttachRunResult(**dict(result))

        except Exception as exception:
            if not isinstance(exception, ApiError):
                exception = ApiError(
                    status=500,
                    code=ApiErrorCodes.InternalServerError,
                    message=str(exception),
                    response=str(exception),
                )

            if not options.on_error:
                raise exception

            await options.on_error(exception)

            return None

    async def stop(self, uuid: str) -> None:
        async with self._client.request(
            handler=RequestHandler.StopRun,
            params=StopRunRequestParams(
                conversation_uuid=uuid,
            ),
        ):
            return None
