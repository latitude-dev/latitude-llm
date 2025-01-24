import asyncio
from typing import Any, AsyncGenerator, Dict, List, Optional, Sequence, Union

from latitude_sdk.client import (
    ChatPromptRequestBody,
    ChatPromptRequestParams,
    Client,
    ClientEvent,
    GetOrCreatePromptRequestBody,
    GetOrCreatePromptRequestParams,
    GetPromptRequestParams,
    RequestHandler,
    RunPromptRequestBody,
    RunPromptRequestParams,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import (
    ChainEventCompleted,
    ChainEventError,
    ChainEvents,
    ChainEventStep,
    ChainEventStepCompleted,
    ContentType,
    FinishedEvent,
    Message,
    MessageRole,
    OnToolCall,
    OnToolCallDetails,
    Prompt,
    SdkOptions,
    StreamCallbacks,
    StreamEvents,
    ToolCall,
    ToolMessage,
    ToolResultContent,
    _Message,
)
from latitude_sdk.util import Model


class PromptOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None


class GetPromptOptions(PromptOptions, Model):
    pass


class GetPromptResult(Prompt, Model):
    pass


class GetOrCreatePromptOptions(PromptOptions, Model):
    prompt: Optional[str] = None


class GetOrCreatePromptResult(Prompt, Model):
    pass


class RunPromptOptions(StreamCallbacks, PromptOptions, Model):
    custom_identifier: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    tools: Optional[Dict[str, OnToolCall]] = None
    stream: Optional[bool] = None


class RunPromptResult(FinishedEvent, Model):
    pass


class ChatPromptOptions(StreamCallbacks, Model):
    tools: Optional[Dict[str, OnToolCall]] = None
    stream: Optional[bool] = None


class ChatPromptResult(FinishedEvent, Model):
    pass


class Prompts:
    _options: SdkOptions
    _client: Client

    def __init__(self, client: Client, options: SdkOptions):
        self._options = options
        self._client = client

    def _ensure_options(self, options: PromptOptions) -> PromptOptions:
        project_id = options.project_id or self._options.project_id
        if not project_id:
            raise ApiError(
                status=404,
                code=ApiErrorCodes.NotFoundError,
                message="Project ID is required",
                response="Project ID is required",
            )

        version_uuid = options.version_uuid or self._options.version_uuid

        return PromptOptions(project_id=project_id, version_uuid=version_uuid)

    async def _handle_stream(
        self, stream: AsyncGenerator[ClientEvent, Any], callbacks: StreamCallbacks
    ) -> FinishedEvent:
        uuid = None
        conversation: List[Message] = []
        response = None

        async for stream_event in stream:
            event = None

            if stream_event.event == str(StreamEvents.Latitude):
                type = stream_event.json().get("type")

                if type == str(ChainEvents.Step):
                    event = ChainEventStep.model_validate_json(stream_event.data)
                    conversation.extend(event.messages)

                elif type == str(ChainEvents.StepCompleted):
                    event = ChainEventStepCompleted.model_validate_json(stream_event.data)

                elif type == str(ChainEvents.Completed):
                    event = ChainEventCompleted.model_validate_json(stream_event.data)
                    uuid = event.uuid
                    conversation.extend(event.messages or [])
                    response = event.response

                elif type == str(ChainEvents.Error):
                    event = ChainEventError.model_validate_json(stream_event.data)
                    raise ApiError(
                        status=400,
                        code=ApiErrorCodes.AIRunError,
                        message=event.error.message,
                        response=stream_event.data,
                    )

                else:
                    raise ApiError(
                        status=500,
                        code=ApiErrorCodes.InternalServerError,
                        message=f"Unknown latitude event: {type}",
                        response=stream_event.data,
                    )

            elif stream_event.event == str(StreamEvents.Provider):
                event = stream_event.json()
                event["event"] = StreamEvents.Provider

            else:
                raise ApiError(
                    status=500,
                    code=ApiErrorCodes.InternalServerError,
                    message=f"Unknown stream event: {stream_event.event}",
                    response=stream_event.data,
                )

            if callbacks.on_event:
                callbacks.on_event(event)

        if not uuid or not response:
            raise ApiError(
                status=500,
                code=ApiErrorCodes.InternalServerError,
                message="Stream ended without a chain-complete event. Missing uuid or response.",
                response="Stream ended without a chain-complete event. Missing uuid or response.",
            )

        # NOTE: FinishedEvent not in on_event
        return FinishedEvent(uuid=uuid, conversation=conversation, response=response)

    def _search_unanswered_tool_calls(self, conversation: List[Message]) -> List[ToolCall]:
        tool_calls: Dict[str, ToolCall] = {}

        for message in conversation:
            if not isinstance(message.content, list):
                continue

            if message.role == MessageRole.Assistant:
                for content in message.content:
                    if content.type == ContentType.ToolCall:
                        tool_calls[content.id] = ToolCall(
                            id=content.id,
                            name=content.name,
                            arguments=content.arguments,
                        )

            elif message.role == MessageRole.Tool:
                for content in message.content:
                    tool_calls.pop(content.id)

        return list(tool_calls.values())

    async def _handle_tool_calls(
        self,
        result: FinishedEvent,
        tool_calls: List[ToolCall],
        options: Union[RunPromptOptions, ChatPromptOptions],
    ) -> Optional[FinishedEvent]:
        assert options.tools is not None
        for tool_call in tool_calls:
            if tool_call.name not in options.tools:
                raise ApiError(
                    status=400,
                    code=ApiErrorCodes.AIRunError,
                    message=f"Tool {tool_call.name} not supplied",
                    response=f"Tool {tool_call.name} not supplied",
                )

        details = OnToolCallDetails(
            conversation_uuid=result.uuid,
            messages=result.conversation,
            pause_execution=lambda: None,  # TODO: Implement
            tool_calls=tool_calls,
        )

        tool_results = await asyncio.gather(
            *[options.tools[tool_call.name](tool_call, details) for tool_call in tool_calls]
        )

        tool_messages = [
            ToolMessage(
                content=[
                    ToolResultContent(
                        id=tool_result.id,
                        name=tool_result.name,
                        result=tool_result.result,
                        is_error=tool_result.is_error,
                    )
                ]
            )
            for tool_result in tool_results
        ]

        next_result = await self.chat(result.uuid, tool_messages, ChatPromptOptions(**dict(options)))

        return FinishedEvent(**dict(next_result)) if next_result else None

    async def get(self, path: str, options: GetPromptOptions) -> GetPromptResult:
        prompt_options = self._ensure_options(options)
        options = GetPromptOptions(**{**dict(options), **dict(prompt_options)})

        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.GetPrompt,
            params=GetPromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
                path=path,
            ),
        ) as response:
            return GetPromptResult.model_validate_json(response.content)

    async def get_or_create(self, path: str, options: GetOrCreatePromptOptions) -> GetOrCreatePromptResult:
        prompt_options = self._ensure_options(options)
        options = GetOrCreatePromptOptions(**{**dict(options), **dict(prompt_options)})

        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.GetOrCreatePrompt,
            params=GetOrCreatePromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
            body=GetOrCreatePromptRequestBody(
                path=path,
                prompt=options.prompt,
            ),
        ) as response:
            return GetOrCreatePromptResult.model_validate_json(response.content)

    async def run(self, path: str, options: RunPromptOptions) -> Optional[RunPromptResult]:
        try:
            prompt_options = self._ensure_options(options)
            options = RunPromptOptions(**{**dict(options), **dict(prompt_options)})

            assert options.project_id is not None

            async with self._client.request(
                handler=RequestHandler.RunPrompt,
                params=RunPromptRequestParams(
                    project_id=options.project_id,
                    version_uuid=options.version_uuid,
                ),
                body=RunPromptRequestBody(
                    path=path,
                    parameters=options.parameters,
                    custom_identifier=options.custom_identifier,
                    stream=options.stream,
                ),
            ) as response:
                if options.stream:
                    result = await self._handle_stream(
                        response.sse(),
                        callbacks=StreamCallbacks(
                            on_event=options.on_event,
                            on_error=options.on_error,
                        ),
                    )
                else:
                    result = RunPromptResult.model_validate_json(response.content)

            if options.tools:
                tool_calls = self._search_unanswered_tool_calls(result.conversation)
                if tool_calls:
                    # NOTE: The last sdk.chat called will already call on_finished
                    result = await self._handle_tool_calls(result, tool_calls, options)
                    return RunPromptResult(**dict(result)) if result else None

            if options.on_finished:
                options.on_finished(FinishedEvent(**dict(result)))

            return RunPromptResult(**dict(result))

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

            options.on_error(exception)

            return None

    async def chat(
        self, uuid: str, messages: Sequence[Union[Message, Dict[str, Any]]], options: ChatPromptOptions
    ) -> Optional[ChatPromptResult]:
        try:
            messages = [_Message.validate_python(message) for message in messages]

            async with self._client.request(
                handler=RequestHandler.ChatPrompt,
                params=ChatPromptRequestParams(
                    conversation_uuid=uuid,
                ),
                body=ChatPromptRequestBody(
                    messages=messages,
                    stream=options.stream,
                ),
            ) as response:
                if options.stream:
                    result = await self._handle_stream(
                        response.sse(),
                        callbacks=StreamCallbacks(
                            on_event=options.on_event,
                            on_error=options.on_error,
                        ),
                    )
                else:
                    result = ChatPromptResult.model_validate_json(response.content)

            if options.tools:
                tool_calls = self._search_unanswered_tool_calls(result.conversation)
                if tool_calls:
                    # NOTE: The last sdk.chat called will already call on_finished
                    result = await self._handle_tool_calls(result, tool_calls, options)
                    return ChatPromptResult(**dict(result)) if result else None

            if options.on_finished:
                options.on_finished(FinishedEvent(**dict(result)))

            return ChatPromptResult(**dict(result))

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

            options.on_error(exception)

            return None

    # TODO: render - needs PromptL in Python

    # TODO: render_chain - needs PromptL in Python
