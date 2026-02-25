from typing import Any, List, Optional, Sequence, Union

from promptl_ai import Adapter, MessageLike, Promptl
from promptl_ai.bindings.types import _Message

from latitude_sdk.client import (
    ChatPromptRequestBody,
    ChatPromptRequestParams,
    Client,
    DeletePromptRequestParams,
    GetAllPromptsRequestParams,
    GetOrCreatePromptRequestBody,
    GetOrCreatePromptRequestParams,
    GetPromptRequestParams,
    RequestHandler,
    RunPromptRequestBody,
    RunPromptRequestParams,
)
from latitude_sdk.sdk.errors import ApiError, ApiErrorCodes
from latitude_sdk.sdk.stream import Streamer
from latitude_sdk.sdk.types import (
    BackgroundResult,
    FinishedResult,
    OnStep,
    OnToolCall,
    Prompt,
    Providers,
    SdkOptions,
    StreamCallbacks,
)
from latitude_sdk.util import Adapter as AdapterUtil
from latitude_sdk.util import Field, Model

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


_GetAllPromptsResult = AdapterUtil[List[GetPromptResult]](List[GetPromptResult])


class GetAllPromptsOptions(PromptOptions, Model):
    pass


class DeletePromptOptions(PromptOptions, Model):
    pass


class DeletePromptResult(Model):
    document_uuid: str = Field(alias=str("documentUuid"))
    path: str


class GetOrCreatePromptOptions(PromptOptions, Model):
    prompt: Optional[str] = None


class GetOrCreatePromptResult(Prompt, Model):
    pass


class RunPromptOptions(StreamCallbacks, PromptOptions, Model):
    custom_identifier: Optional[str] = None
    parameters: Optional[dict[str, Any]] = None
    tools: Optional[dict[str, OnToolCall]] = None
    stream: Optional[bool] = True  # Note: making stream the default
    background: Optional[bool] = None
    mcp_headers: Optional[dict[str, dict[str, str]]] = None
    messages: Optional[Sequence[MessageLike]] = None


RunPromptResult = Union[FinishedResult, BackgroundResult]


class ChatPromptOptions(StreamCallbacks, Model):
    tools: Optional[dict[str, OnToolCall]] = None
    stream: Optional[bool] = True  # Note: making stream the default
    mcp_headers: Optional[dict[str, dict[str, str]]] = None


class ChatPromptResult(FinishedResult, Model):
    pass


class RenderPromptOptions(Model):
    parameters: Optional[dict[str, Any]] = None
    adapter: Optional[Adapter] = None
    full_path: Optional[str] = None
    references: Optional[dict[str, str]] = None


class RenderPromptResult(Model):
    messages: List[MessageLike]
    config: dict[str, Any]


class RenderChainOptions(Model):
    parameters: Optional[dict[str, Any]] = None
    adapter: Optional[Adapter] = None
    full_path: Optional[str] = None
    references: Optional[dict[str, str]] = None


class RenderChainResult(RenderPromptResult, Model):
    pass


class Prompts:
    _options: SdkOptions
    _client: Client
    _streamer: Streamer
    _promptl: Promptl

    def __init__(self, client: Client, streamer: Streamer, promptl: Promptl, options: SdkOptions):
        self._options = options
        self._client = client
        self._streamer = streamer
        self._promptl = promptl

    def _ensure_prompt_options(self, options: PromptOptions):
        if not options.project_id:
            raise ApiError(
                status=404,
                code=ApiErrorCodes.NotFoundError,
                message="Project ID is required",
                response="Project ID is required",
            )

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

    async def get_all(self, options: Optional[GetAllPromptsOptions] = None) -> List[GetPromptResult]:
        options = GetAllPromptsOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.GetAllPrompts,
            params=GetAllPromptsRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
            ),
        ) as response:
            return _GetAllPromptsResult.validate_json(response.content)

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

    async def delete(self, path: str, options: Optional[DeletePromptOptions] = None) -> DeletePromptResult:
        options = DeletePromptOptions(**{**dict(self._options), **dict(options or {})})
        self._ensure_prompt_options(options)
        assert options.project_id is not None

        async with self._client.request(
            handler=RequestHandler.DeletePrompt,
            params=DeletePromptRequestParams(
                project_id=options.project_id,
                version_uuid=options.version_uuid,
                path=path,
            ),
        ) as response:
            return DeletePromptResult.model_validate_json(response.content)

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
                    tools=list(options.tools.keys()) if options.tools else None,
                    stream=options.stream,
                    background=options.background,
                    mcp_headers=options.mcp_headers,
                    messages=[_Message.validate_python(m) for m in options.messages] if options.messages else None,
                ),
                stream=options.stream,
            ) as response:
                if options.background:
                    return BackgroundResult.model_validate_json(response.content)
                if options.stream:
                    result = await self._streamer.handle(response.sse(), options.on_event, options.tools)
                else:
                    result = FinishedResult.model_validate_json(response.content)

            if options.on_finished:
                await options.on_finished(result)

            return result

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

    async def chat(
        self, uuid: str, messages: Sequence[MessageLike], options: Optional[ChatPromptOptions] = None
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
                    tools=list(options.tools.keys()) if options.tools else None,
                    stream=options.stream,
                    mcp_headers=options.mcp_headers,
                ),
                stream=options.stream,
            ) as response:
                if options.stream:
                    result = await self._streamer.handle(response.sse(), options.on_event, options.tools)
                else:
                    result = FinishedResult.model_validate_json(response.content)

            if options.on_finished:
                await options.on_finished(result)

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

            await options.on_error(exception)

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
            full_path=options.full_path,
            references=options.references,
        )

        return RenderPromptResult(
            messages=result.messages,
            config=self._adapt_prompt_config(result.config, adapter),
        )

    async def render_chain(
        self, prompt: Prompt, on_step: OnStep, options: Optional[RenderChainOptions] = None
    ) -> RenderChainResult:
        options = RenderChainOptions(**{**dict(self._options), **dict(options or {})})
        adapter = options.adapter or _PROVIDER_TO_ADAPTER.get(prompt.provider or Providers.OpenAI, Adapter.OpenAI)

        chain = self._promptl.chains.create(
            prompt=prompt.content,
            parameters=options.parameters,
            adapter=adapter,
            full_path=options.full_path or prompt.path,
            references=options.references,
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
