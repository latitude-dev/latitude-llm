"""
Attribute constants for Latitude telemetry spans.
Mirrors the TypeScript implementation in @latitude-data/constants.
"""

from typing import Dict


class _PromptMessageField:
    """Helper class to build indexed prompt message attribute names."""

    def __init__(self, prefix: str, index: int):
        self._prefix = prefix
        self._index = index

    @property
    def role(self) -> str:
        return f"{self._prefix}.{self._index}.role"

    @property
    def content(self) -> str:
        return f"{self._prefix}.{self._index}.content"

    def toolCalls(self, tool_call_index: int) -> Dict[str, str]:
        base = f"{self._prefix}.{self._index}.tool_calls.{tool_call_index}"
        return {
            "id": f"{base}.id",
            "name": f"{base}.name",
            "arguments": f"{base}.arguments",
        }

    @property
    def tool(self) -> Dict[str, str]:
        return {
            "callId": f"{self._prefix}.{self._index}.tool_call_id",
            "toolName": f"{self._prefix}.{self._index}.tool_name",
            "isError": f"{self._prefix}.{self._index}.is_error",
        }


class _PromptField:
    """Helper class for building prompt attribute names with indexing."""

    def __init__(self, root: str):
        self._root = root

    def index(self, i: int) -> _PromptMessageField:
        return _PromptMessageField(self._root, i)


class _LatitudeRequestAttributes:
    _root = "gen_ai.request"
    model = "gen_ai.request.model"
    configuration = "gen_ai.request.configuration"
    template = "gen_ai.request.template"
    parameters = "gen_ai.request.parameters"
    messages = "gen_ai.request.messages"
    systemPrompt = "gen_ai.request.system"


class _LatitudeResponseAttributes:
    _root = "gen_ai.response"
    messages = "gen_ai.response.messages"


class _LatitudeUsageAttributes:
    promptTokens = "gen_ai.usage.prompt_tokens"
    cachedTokens = "gen_ai.usage.cached_tokens"
    reasoningTokens = "gen_ai.usage.reasoning_tokens"
    completionTokens = "gen_ai.usage.completion_tokens"


class _LatitudeAttributes:
    """Latitude-specific span attributes."""

    name = "latitude.name"
    type = "latitude.type"
    documentUuid = "latitude.document_uuid"
    promptPath = "latitude.prompt_path"
    commitUuid = "latitude.commit_uuid"
    documentLogUuid = "latitude.document_log_uuid"
    projectId = "latitude.project_id"
    experimentUuid = "latitude.experiment_uuid"
    source = "latitude.source"
    externalId = "latitude.external_id"
    testDeploymentId = "latitude.test_deployment_id"
    internal = "latitude.internal"

    request = _LatitudeRequestAttributes()
    response = _LatitudeResponseAttributes()
    usage = _LatitudeUsageAttributes()


class _GenAIUsageAttributes:
    inputTokens = "gen_ai.usage.input_tokens"
    outputTokens = "gen_ai.usage.output_tokens"


class _GenAIResponseAttributes:
    id = "gen_ai.response.id"
    model = "gen_ai.response.model"
    finishReasons = "gen_ai.response.finish_reasons"


class _GenAIToolCallAttributes:
    id = "gen_ai.tool.call.id"
    arguments = "gen_ai.tool.call.arguments"
    result = "gen_ai.tool.call.result"


class _GenAIToolAttributes:
    definitions = "gen_ai.tool.definitions"
    call = _GenAIToolCallAttributes()
    name = "gen_ai.tool.name"
    description = "gen_ai.tool.description"
    type = "gen_ai.tool.type"


class _GenAIDeprecatedToolResultAttributes:
    value = "gen_ai.tool.result.value"
    isError = "gen_ai.tool.result.is_error"


class _GenAIDeprecatedToolAttributes:
    name = "gen_ai.tool.name"
    type = "gen_ai.tool.type"
    result = _GenAIDeprecatedToolResultAttributes()


class _GenAIDeprecatedAttributes:
    system = "gen_ai.system"
    tool = _GenAIDeprecatedToolAttributes()
    prompt = _PromptField("gen_ai.prompt")
    completion = _PromptField("gen_ai.completion")


class _GenAIInputAttributes:
    messages = "gen_ai.input.messages"


class _GenAIOutputAttributes:
    messages = "gen_ai.output.messages"


class _GenAIAttributes:
    """OpenTelemetry GenAI semantic conventions."""

    conversationId = "gen_ai.conversation.id"
    operation = "gen_ai.operation.name"
    provider = "gen_ai.provider.name"
    response = _GenAIResponseAttributes()
    usage = _GenAIUsageAttributes()
    systemInstructions = "gen_ai.system.instructions"
    tool = _GenAIToolAttributes()
    input = _GenAIInputAttributes()
    output = _GenAIOutputAttributes()
    _deprecated = _GenAIDeprecatedAttributes()


class _HTTPRequestAttributes:
    url = "http.request.url"
    body = "http.request.body"
    header = "http.request.header"
    headers = "http.request.headers"
    method = "http.request.method"


class _HTTPResponseAttributes:
    body = "http.response.body"
    header = "http.response.header"
    headers = "http.response.headers"
    statusCode = "http.response.status_code"


class _HTTPAttributes:
    request = _HTTPRequestAttributes()
    response = _HTTPResponseAttributes()


class _OTELStatusAttributes:
    code = "otel.status_code"
    description = "otel.status_description"


class _OTELScopeAttributes:
    name = "otel.scope.name"
    version = "otel.scope.version"


class _OTELAttributes:
    scope = _OTELScopeAttributes()
    status = _OTELStatusAttributes()


class _ServiceAttributes:
    name = "service.name"


class _ErrorAttributes:
    type = "error.type"


class _ExceptionAttributes:
    message = "exception.message"
    type = "exception.type"


class _OpenTelemetryAttributes:
    """Official OpenTelemetry semantic conventions."""

    SERVICE = _ServiceAttributes()
    OTEL = _OTELAttributes()
    ERROR = _ErrorAttributes()
    EXCEPTION = _ExceptionAttributes()
    HTTP = _HTTPAttributes()
    GEN_AI = _GenAIAttributes()


class _OpenInferenceToolCallFunctionAttributes:
    arguments = "tool_call.function.arguments"
    result = "tool_call.function.result"


class _OpenInferenceToolCallAttributes:
    id = "tool_call.id"
    function = _OpenInferenceToolCallFunctionAttributes()


class _OpenInferenceToolAttributes:
    name = "tool.name"


class _OpenInferenceLLMTokenCountPromptDetailsAttributes:
    cacheInput = "llm.token_count.prompt_details.cache_input"
    cacheRead = "llm.token_count.prompt_details.cache_read"
    cacheWrite = "llm.token_count.prompt_details.cache_write"


class _OpenInferenceLLMTokenCountCompletionDetailsAttributes:
    reasoning = "llm.token_count.completion_details.reasoning"


class _OpenInferenceLLMTokenCountAttributes:
    prompt = "llm.token_count.prompt"
    promptDetails = _OpenInferenceLLMTokenCountPromptDetailsAttributes()
    completionDetails = _OpenInferenceLLMTokenCountCompletionDetailsAttributes()
    completion = "llm.token_count.completion"


class _OpenInferenceLLMCostAttributes:
    prompt = "llm.cost.prompt"
    completion = "llm.cost.completion"
    total = "llm.cost.total"


class _OpenInferenceLLMAttributes:
    provider = "llm.provider"
    system = "llm.system"
    model = "llm.model_name"
    inputMessages = "llm.input_messages"
    outputMessages = "llm.output_messages"
    invocationParameters = "llm.invocation_parameters"
    prompts = "llm.prompts"
    completions = "llm.completions"
    tools = "llm.tools"
    tokenCount = _OpenInferenceLLMTokenCountAttributes()
    cost = _OpenInferenceLLMCostAttributes()


class _OpenInferenceAttributes:
    """OpenInference (Arize/Phoenix) semantic conventions."""

    tool = _OpenInferenceToolAttributes()
    toolCall = _OpenInferenceToolCallAttributes()
    llm = _OpenInferenceLLMAttributes()


class _OpenLLMetryLLMRequestAttributes:
    type = "llm.request.type"


class _OpenLLMetryLLMResponseAttributes:
    finishReason = "llm.response.finish_reason"
    stopReason = "llm.response.stop_reason"


class _OpenLLMetryLLMAttributes:
    request = _OpenLLMetryLLMRequestAttributes()
    response = _OpenLLMetryLLMResponseAttributes()


class _OpenLLMetryUsageAttributes:
    cacheCreationInputTokens = "gen_ai.usage.cache_creation_input_tokens"
    cacheReadInputTokens = "gen_ai.usage.cache_read_input_tokens"


class _OpenLLMetryAttributes:
    """OpenLLMetry (Traceloop) semantic conventions."""

    llm = _OpenLLMetryLLMAttributes()
    usage = _OpenLLMetryUsageAttributes()


class _AISdkModelAttributes:
    id = "ai.model.id"
    provider = "ai.model.provider"


class _AISdkResponseAttributes:
    id = "ai.response.id"
    model = "ai.response.model"
    finishReason = "ai.response.finishReason"
    text = "ai.response.text"
    object = "ai.response.object"
    toolCalls = "ai.response.toolCalls"


class _AISdkToolCallAttributes:
    name = "ai.toolCall.name"
    id = "ai.toolCall.id"
    args = "ai.toolCall.args"
    result = "ai.toolCall.result"


class _AISdkUsageAttributes:
    completionTokens = "ai.usage.completionTokens"
    promptTokens = "ai.usage.promptTokens"


class _AISdkPromptAttributes:
    messages = "ai.prompt.messages"


class _AISdkRequestHeadersAttributes:
    _root = "ai.request.headers"


class _AISdkRequestAttributes:
    headers = _AISdkRequestHeadersAttributes()


class _AISdkAttributes:
    """Vercel AI SDK semantic conventions."""

    operationId = "ai.operationId"
    model = _AISdkModelAttributes()
    request = _AISdkRequestAttributes()
    response = _AISdkResponseAttributes()
    toolCall = _AISdkToolCallAttributes()
    usage = _AISdkUsageAttributes()
    settings = "ai.settings"
    prompt = _AISdkPromptAttributes()


class ATTRIBUTES:
    """All attribute constants for telemetry spans."""

    LATITUDE = _LatitudeAttributes()
    OPENTELEMETRY = _OpenTelemetryAttributes()
    OPENINFERENCE = _OpenInferenceAttributes()
    OPENLLMETRY = _OpenLLMetryAttributes()
    AI_SDK = _AISdkAttributes()


class _GenAIOperationValues:
    chat = "chat"
    createAgent = "create_agent"
    embeddings = "embeddings"
    executeTool = "execute_tool"
    generateContent = "generate_content"
    invokeAgent = "invoke_agent"
    textCompletion = "text_completion"


class _GenAIResponseFinishReasonsValues:
    stop = "stop"
    length = "length"
    contentFilter = "content_filter"
    toolCalls = "tool_calls"
    error = "error"
    other = "other"
    unknown = "unknown"


class _GenAIOutputTypeValues:
    image = "image"
    json = "json"
    speech = "speech"
    text = "text"


class _GenAIToolTypeValues:
    function = "function"


class _GenAIDeprecatedOperationValues:
    tool = "tool"
    completion = "completion"
    embedding = "embedding"
    retrieval = "retrieval"
    reranking = "reranking"


class _GenAIDeprecatedValues:
    operation = _GenAIDeprecatedOperationValues()


class _OpenTelemetryGenAIResponseValues:
    finishReasons = _GenAIResponseFinishReasonsValues()


class _OpenTelemetryGenAIOutputValues:
    type = _GenAIOutputTypeValues()


class _OpenTelemetryGenAIToolValues:
    type = _GenAIToolTypeValues()


class _OpenTelemetryGenAIValues:
    operation = _GenAIOperationValues()
    response = _OpenTelemetryGenAIResponseValues()
    output = _OpenTelemetryGenAIOutputValues()
    tool = _OpenTelemetryGenAIToolValues()
    _deprecated = _GenAIDeprecatedValues()


class _OpenTelemetryValues:
    GEN_AI = _OpenTelemetryGenAIValues()


class _OpenLLMetryLLMRequestTypeValues:
    completion = "completion"
    chat = "chat"
    rerank = "rerank"
    embedding = "embedding"
    unknown = "unknown"


class _OpenLLMetryLLMRequestValues:
    type = _OpenLLMetryLLMRequestTypeValues()


class _OpenLLMetryLLMValues:
    request = _OpenLLMetryLLMRequestValues()


class _OpenLLMetryValues:
    llm = _OpenLLMetryLLMValues()


class _AISdkOperationIdValues:
    # Vercel Wrappers
    generateText = "ai.generateText"
    streamText = "ai.streamText"
    generateObject = "ai.generateObject"
    streamObject = "ai.streamObject"
    # Completions
    generateTextDoGenerate = "ai.generateText.doGenerate"
    streamTextDoStream = "ai.streamText.doStream"
    generateObjectDoGenerate = "ai.generateObject.doGenerate"
    streamObjectDoStream = "ai.streamObject.doStream"
    # Embeddings
    embed = "ai.embed"
    embedDoEmbed = "ai.embed.doEmbed"
    embedMany = "ai.embed.embedMany"
    embedManyDoEmbed = "ai.embed.embedMany.doEmbed"
    # Tool calling
    toolCall = "ai.toolCall"


class _AISdkValues:
    operationId = _AISdkOperationIdValues()


class _LatitudeValues:
    pass


class VALUES:
    """All value constants for telemetry spans."""

    LATITUDE = _LatitudeValues()
    OPENTELEMETRY = _OpenTelemetryValues()
    OPENLLMETRY = _OpenLLMetryValues()
    AI_SDK = _AISdkValues()
