from typing import Any, AsyncGenerator, Callable, List, Optional, Sequence

from promptl_ai import (
    Adapter,
    Message,
    MessageLike,
    Promptl,
)
from promptl_ai.bindings.types import _Message

from latitude_sdk.client import (
    ChatPromptRequestBody,
    ChatPromptRequestParams,
    Client,
    ClientEvent,
    GetAllPromptRequestParams,
    GetOrCreatePromptRequestBody,
    GetOrCreatePromptRequestParams,
    GetPromptRequestParams,
    RequestHandler,
    RunPromptRequestBody,
    RunPromptRequestParams,
    ToolResultsRequestBody,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.types import (
    ChainEvents,
    FinishedResult,
    OnStep,
    OnToolCall,
    OnToolCallDetails,
    Prompt,
    Providers,
    SdkOptions,
    StreamCallbacks,
    StreamEvents,
    ToolResult,
    _LatitudeEvent,
)
from latitude_sdk.util import Adapter as AdapterUtil
from latitude_sdk.util import Model

_PROVIDER_TO_ADAPTER = {
    Providers.OpenAI: Adapter.OpenAI,
    Providers.Anthropic: Adapter.Anthropic,
}

_PROMPT_ATTR_TO_ADAPTER_ATTR = {
    "maxTokens": ("max_tokens", [Adapter.OpenAI, Adapter.Anthropic]),
    "topP": ("top_p", [Adapter.OpenAI, Adapter.Anthropic]),
    "topK": ("top_k", [Adapter.OpenAI, Adapter.Anthropic]),
    "presencePenalty": ("presence_penalty", [Adapter.OpenAI, Adapter.Anthropic]),
    "stopSequences": ("stop_sequences", [Adapter.OpenAI, Adapter.Anthropic]),
    "toolChoice": ("tool_choice", [Adapter.OpenAI, Adapter.Anthropic]),
}


class PromptOptions(Model):
    project_id: Optional[int] = None
    version_uuid: Optional[str] = None


class GetPromptOptions(PromptOptions, Model):
    pass


class GetPromptResult(Prompt, Model):
    pass


_GetAllPromptResults = AdapterUtil[List[GetPromptResult]](List[GetPromptResult])


class GetAllPromptOptions(PromptOptions, Model):
    pass


class GetOrCreatePromptOptions(PromptOptions, Model):
    prompt: Optional[str] = None


class GetOrCreatePromptResult(Prompt, Model):
    pass


class RunPromptOptions(StreamCallbacks, PromptOptions, Model):
    custom_identifier: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    tools: Optional[dict[str, OnToolCall]] = None
    stream: Optional[bool] = None


class RunPromptResult(FinishedResult, Model):
    pass


class ChatPromptOptions(StreamCallbacks, Model):
    tools: Optional[dict[str, OnToolCall]] = None
    stream: Optional[bool] = None


class ChatPromptResult(FinishedResult, Model):
    pass


class RenderPromptOptions(Model):
    parameters: Optional[dict[str, Any]] = None
    adapter: Optional[Adapter] = None


class RenderPromptResult(Model):
    messages: List[MessageLike]
    config: dict[str, Any]


class RenderChainOptions(Model):
    parameters: Optional[dict[str, Any]] = None
    adapter: Optional[Adapter] = None


class RenderChainResult(RenderPromptResult, Model):
    pass


class Prompts:
    _options: SdkOptions
    _client: Client
    _promptl: Promptl

    def __init__(self, client: Client, promptl: Promptl, options: SdkOptions):
        self._options = options
        self._client = client
        self._promptl = promptl

    def _ensure_prompt_options(self, options: PromptOptions):
        if not options.project_id:
            raise ApiError(
                status=404,
                code=ApiErrorCodes.NotFoundError,
                message="Project ID is required",
                response="Project ID is required",
            )

    async def _handle_stream(
        self,
        stream: AsyncGenerator[ClientEvent, Any],
        on_event: Optional[StreamCallbacks.OnEvent],
        on_tool_call: Optional[Callable[[dict[str, Any]], Any]] = None,
    ) -> FinishedResult:
        uuid = None
        conversation: List[Message] = []
        response = None

        async for stream_event in stream:
            event = None

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

                # Handle tool calls when received in the stream
                if on_tool_call and event.get("type") == "tool-call":
                    await on_tool_call(event)

            else:
                raise ApiError(
                    status=500,
                    code=ApiErrorCodes.InternalServerError,
                    message=f"Unknown stream event: {stream_event.event}",
                    response=stream_event.data,
                )

            if on_event:
                on_event(event)

        if not uuid or not response:
            raise ApiError(
                status=500,
                code=ApiErrorCodes.InternalServerError,
                message="Stream ended without a chain-complete event. Missing uuid or response.",
                response="Stream ended without a chain-complete event. Missing uuid or response.",
            )

        return FinishedResult(
            uuid=uuid,
            conversation=conversation,
            response=response,
        )

    @staticmethod
    async def _wrap_tool_handler(
        handler: OnToolCall, arguments: dict[str, Any], details: OnToolCallDetails
    ) -> ToolResult:
        tool_result: dict[str, Any] = {"id": details.id, "name": details.name}

        try:
            result = await handler(arguments, details)

            return ToolResult(**tool_result, result=result)
        except Exception as exception:
            return ToolResult(**tool_result, result=str(exception), is_error=True)

    async def _handle_tool_call(
        self,
        event: dict[str, Any],
        tools: dict[str, OnToolCall],
    ) -> None:
        toolCallId: str = event["toolCallId"]
        toolName: str = event["toolName"]
        args: dict[str, Any] = event["args"]

        tool = tools.get(toolName)
        if not tool:
            return

        tool_result = await self._wrap_tool_handler(
            tool,
            args,
            OnToolCallDetails(
                id=toolCallId,
                name=toolName,
                arguments=args,
            ),
        )

        try:
            async with self._client.request(
                handler=RequestHandler.ToolResults,
                params=None,
                body=ToolResultsRequestBody(
                    tool_call_id=toolCallId,
                    result=tool_result.result,
                    is_error=tool_result.is_error,
                ),
            ) as _:
                pass
        except Exception as exception:
            if not isinstance(exception, ApiError):
                exception = ApiError(
                    status=500,
                    code=ApiErrorCodes.InternalServerError,
                    message=str(exception),
                    response=str(exception),
                )

            # Add context about which tool failed
            message = f"Failed to execute tool {toolName}. \nLatitude API returned the following error:\
                    \n\n{exception.message}"

            raise ApiError(
                status=exception.status,
                code=exception.code,
                message=message,
                response=exception.response,
            ) from exception

    def _on_tool_call(self, tools: dict[str, OnToolCall]) -> Callable[[dict[str, Any]], Any]:
        return lambda event: self._handle_tool_call(event, tools)

    async def get(self, path: str, options: Optional[GetPromptOptions] = None) -> GetPromptResult:
        options = GetPromptOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
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

    async def get_all(self, options: Optional[GetAllPromptOptions] = None) -> List[GetPromptResult]:
        options = GetAllPromptOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.GetAllPrompts,
            params=GetAllPromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
        ) as response:
            return _GetAllPromptResults.validate_json(response.content)

    async def get_or_create(
        self, path: str, options: Optional[GetOrCreatePromptOptions] = None
    ) -> GetOrCreatePromptResult:
        options = GetOrCreatePromptOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
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

    async def run(self, path: str, options: Optional[RunPromptOptions] = None) -> Optional[RunPromptResult]:
        options = RunPromptOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
        assert options.project_id is not None

        try:
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
                    tools=list(options.tools.keys()) if options.tools and options.stream else None,
                ),
            ) as response:
                if options.stream:
                    result = await self._handle_stream(
                        response.sse(),
                        options.on_event,
                        self._on_tool_call(options.tools if options.tools else {}),
                    )
                else:
                    result = RunPromptResult.model_validate_json(response.content)

            if options.on_finished:
                options.on_finished(FinishedResult(**dict(result)))

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
        self,
        uuid: str,
        messages: Sequence[MessageLike],
        options: Optional[ChatPromptOptions] = None,
    ) -> Optional[ChatPromptResult]:
        options = ChatPromptOptions(**{**dict(self._options), **dict(options or {})})

        messages = [_Message.validate_python(message) for message in messages]

        try:
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
                        options.on_event,
                        self._on_tool_call(options.tools if options.tools else {}),
                    )
                else:
                    result = ChatPromptResult.model_validate_json(response.content)

            if options.on_finished:
                options.on_finished(FinishedResult(**dict(result)))

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

    def _adapt_prompt_config(self, config: dict[str, Any], adapter: Adapter) -> dict[str, Any]:
        adapted_config: dict[str, Any] = {}

        # NOTE: Should we delete attributes not supported by the provider?
        for attr, value in config.items():
            if attr in _PROMPT_ATTR_TO_ADAPTER_ATTR and adapter in _PROMPT_ATTR_TO_ADAPTER_ATTR[attr][1]:
                adapted_config[_PROMPT_ATTR_TO_ADAPTER_ATTR[attr][0]] = value
            else:
                adapted_config[attr] = value

        return adapted_config

    async def render(self, prompt: str, options: Optional[RenderPromptOptions] = None) -> RenderPromptResult:
        options = RenderPromptOptions(**{**dict(self._options), **dict(options or {})})
        adapter = options.adapter or Adapter.OpenAI

        result = self._promptl.prompts.render(
            prompt=prompt,
            parameters=options.parameters,
            adapter=adapter,
        )

        return RenderPromptResult(
            messages=result.messages,
            config=self._adapt_prompt_config(result.config, adapter),
        )

    async def render_chain(
        self,
        prompt: Prompt,
        on_step: OnStep,
        options: Optional[RenderChainOptions] = None,
    ) -> RenderChainResult:
        options = RenderChainOptions(**{**dict(self._options), **dict(options or {})})
        adapter = options.adapter or _PROVIDER_TO_ADAPTER.get(prompt.provider or Providers.OpenAI, Adapter.OpenAI)

        chain = self._promptl.chains.create(
            prompt=prompt.content,
            parameters=options.parameters,
            adapter=adapter,
        )

        step = None
        response = None
        while not chain.completed:
            step = chain.step(response)
            if not step.completed:
                response = await on_step(step.messages, self._adapt_prompt_config(step.config, adapter))

        assert step is not None

        return RenderChainResult(
            messages=step.messages,
            config=self._adapt_prompt_config(step.config, adapter),
        )
