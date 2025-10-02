from typing import Any, AsyncGenerator, List, Optional

from promptl_ai import Message

from latitude_sdk.client import Client, ClientEvent, RequestHandler, ToolResultsRequestBody
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import (
    ChainEvents,
    FinishedResult,
    OnToolCall,
    OnToolCallDetails,
    ProviderEvents,
    ProviderEventToolCalled,
    StreamCallbacks,
    StreamEvents,
    ToolResult,
    _LatitudeEvent,
)


class Streamer:
    _client: Client

    def __init__(self, client: Client):
        self._client = client

    async def handle(
        self,
        stream: AsyncGenerator[ClientEvent, Any],
        on_event: Optional[StreamCallbacks.OnEvent],
        tools: Optional[dict[str, OnToolCall]],
    ) -> FinishedResult:
        uuid = None
        conversation: List[Message] = []
        response = None

        async for stream_event in stream:
            event = None
            tool_call = None

            if stream_event.event == str(StreamEvents.Latitude):
                event = _LatitudeEvent.validate_json(stream_event.data)
                conversation = event.messages
                uuid = event.uuid

                if event.type == ChainEvents.ProviderCompleted:
                    response = event.response

                elif event.type == ChainEvents.ChainError:
                    raise ApiError(
                        status=400,
                        code=ApiErrorCodes.AIRunError,
                        message=event.error.message,
                        response=stream_event.data,
                    )

            elif stream_event.event == str(StreamEvents.Provider):
                event = stream_event.json()
                event["event"] = StreamEvents.Provider

                if event.get("type") == str(ProviderEvents.ToolCalled):
                    tool_call = ProviderEventToolCalled.model_validate_json(stream_event.data)

            else:
                raise ApiError(
                    status=500,
                    code=ApiErrorCodes.InternalServerError,
                    message=f"Unknown stream event: {stream_event.event}",
                    response=stream_event.data,
                )

            if on_event:
                await on_event(event)

            if tool_call:
                await self._handle_tool_call(tool_call, tools)

        if not uuid or not response:
            raise ApiError(
                status=500,
                code=ApiErrorCodes.InternalServerError,
                message="Stream ended without a chain-complete event. Missing uuid or response.",
                response="Stream ended without a chain-complete event. Missing uuid or response.",
            )

        return FinishedResult(uuid=uuid, conversation=conversation, response=response)

    @staticmethod
    async def _wrap_tool_handler(
        handler: OnToolCall, arguments: dict[str, Any], details: OnToolCallDetails
    ) -> ToolResult:
        tool_result: dict[str, Any] = {"id": details.id, "name": details.name}

        try:
            result = await handler(arguments, details)

            return ToolResult(**tool_result, result=result, is_error=False)
        except Exception as exception:
            return ToolResult(**tool_result, result=str(exception), is_error=True)

    async def _handle_tool_call(
        self, tool_call: ProviderEventToolCalled, tools: Optional[dict[str, OnToolCall]]
    ) -> None:
        # NOTE: Do not handle tool calls if user specified no tools
        if not tools:
            return

        tool_handler = tools.get(tool_call.name)
        # NOTE: If handler not found, do not handle tool call because it could be a built-in tool
        if not tool_handler:
            return

        tool_result = await self._wrap_tool_handler(
            tool_handler,
            tool_call.arguments,
            OnToolCallDetails(
                id=tool_call.id,
                name=tool_call.name,
                arguments=tool_call.arguments,
            ),
        )

        async with self._client.request(
            handler=RequestHandler.ToolResults,
            body=ToolResultsRequestBody(
                tool_call_id=tool_call.id,
                result=tool_result.result,
                is_error=tool_result.is_error,
            ),
        ):
            return
