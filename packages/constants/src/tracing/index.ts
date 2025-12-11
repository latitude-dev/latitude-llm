import { z } from 'zod'

export * from './span'
export * from './trace'

/* Note: Instrumentation scopes from all language SDKs */

export const SCOPE_LATITUDE = 'so.latitude.instrumentation'

export enum InstrumentationScope {
  Manual = 'manual',
  Latitude = 'latitude',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
  AzureOpenAI = 'azure',
  VercelAI = 'vercelai',
  VertexAI = 'vertexai',
  AIPlatform = 'aiplatform',
  MistralAI = 'mistralai', // Only python
  Bedrock = 'bedrock',
  Sagemaker = 'sagemaker', // Only python
  TogetherAI = 'togetherai',
  Replicate = 'replicate', // Only python
  Groq = 'groq', // Only python
  Cohere = 'cohere',
  LiteLLM = 'litellm', // Only python
  Langchain = 'langchain',
  LlamaIndex = 'llamaindex',
  DSPy = 'dspy', // Only python
  Haystack = 'haystack', // Only python
  Ollama = 'ollama', // Only python
  Transformers = 'transformers', // Only python
  AlephAlpha = 'alephalpha', // Only python
}

/* Note: non-standard OpenTelemetry semantic conventions used in Latitude */

const ATTR_LATITUDE = 'latitude'

export const ATTR_LATITUDE_INTERNAL = `${ATTR_LATITUDE}.internal`

export const ATTR_LATITUDE_TYPE = `${ATTR_LATITUDE}.type`

export const ATTR_LATITUDE_PROMPT_PATH = `${ATTR_LATITUDE}.promptPath`

export const GEN_AI_TOOL_TYPE_VALUE_FUNCTION = 'function'
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments'
export const ATTR_GEN_AI_TOOL_RESULT_VALUE = 'gen_ai.tool.result.value'
export const ATTR_GEN_AI_TOOL_RESULT_IS_ERROR = 'gen_ai.tool.result.is_error'

export const ATTR_GEN_AI_REQUEST = 'gen_ai.request'
export const ATTR_GEN_AI_REQUEST_MODEL = 'gen_ai.request.model'
export const ATTR_GEN_AI_REQUEST_CONFIGURATION = 'gen_ai.request.configuration'
export const ATTR_GEN_AI_REQUEST_TEMPLATE = 'gen_ai.request.template'
export const ATTR_GEN_AI_REQUEST_PARAMETERS = 'gen_ai.request.parameters'
export const ATTR_GEN_AI_REQUEST_MESSAGES = 'gen_ai.request.messages'
export const ATTR_GEN_AI_REQUEST_SYSTEM_PROMPT = 'gen_ai.request.system'
export const ATTR_GEN_AI_RESPONSE = 'gen_ai.response'
export const ATTR_GEN_AI_RESPONSE_MESSAGES = 'gen_ai.response.messages'

export const ATTR_GEN_AI_USAGE_PROMPT_TOKENS = 'gen_ai.usage.prompt_tokens'
export const ATTR_GEN_AI_USAGE_CACHED_TOKENS = 'gen_ai.usage.cached_tokens'
export const ATTR_GEN_AI_USAGE_REASONING_TOKENS = 'gen_ai.usage.reasoning_tokens' // prettier-ignore
export const ATTR_GEN_AI_USAGE_COMPLETION_TOKENS = 'gen_ai.usage.completion_tokens' // prettier-ignore

export const ATTR_GEN_AI_PROMPTS = 'gen_ai.prompt' // gen_ai.prompt.{index}.{role/content/...}
export const ATTR_GEN_AI_COMPLETIONS = 'gen_ai.completion' // gen_ai.completion.{index}.{role/content/...}
export const ATTR_GEN_AI_MESSAGE_ROLE = 'role'
export const ATTR_GEN_AI_MESSAGE_CONTENT = 'content' // string or object
export const ATTR_GEN_AI_MESSAGE_TOOL_NAME = 'tool_name'
export const ATTR_GEN_AI_MESSAGE_TOOL_CALL_ID = 'tool_call_id'
export const ATTR_GEN_AI_MESSAGE_TOOL_RESULT_IS_ERROR = 'is_error'
export const ATTR_GEN_AI_MESSAGE_TOOL_CALLS = 'tool_calls' // gen_ai.completion.{index}.tool_calls.{index}.{id/name/arguments}
export const ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ID = 'id'
export const ATTR_GEN_AI_MESSAGE_TOOL_CALLS_NAME = 'name'
export const ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS = 'arguments'

export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_STOP = 'stop'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_LENGTH = 'length'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_CONTENT_FILTER = 'content_filter' // prettier-ignore
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS = 'tool_calls'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_ERROR = 'error'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_OTHER = 'other'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_UNKNOWN = 'unknown'

export const ATTR_HTTP_REQUEST_URL = 'http.request.url'
export const ATTR_HTTP_REQUEST_BODY = 'http.request.body'
export const ATTR_HTTP_REQUEST_HEADER = 'http.request.header'
export const ATTR_HTTP_REQUEST_HEADERS = 'http.request.headers'
export const ATTR_HTTP_RESPONSE_BODY = 'http.response.body'
export const ATTR_HTTP_RESPONSE_HEADER = 'http.response.header'
export const ATTR_HTTP_RESPONSE_HEADERS = 'http.response.headers'

/* Note: non-standard OpenTelemetry semantic conventions used in other systems */

// https://github.com/Arize-ai/openinference/blob/main/python/openinference-semantic-conventions/src/openinference/semconv/trace/__init__.py
export const GEN_AI_OPERATION_NAME_VALUE_TOOL = 'tool'
export const GEN_AI_OPERATION_NAME_VALUE_COMPLETION = 'completion'
export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDING = 'embedding'
export const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = 'retrieval'
export const GEN_AI_OPERATION_NAME_VALUE_RERANKING = 'reranking'

export const ATTR_TOOL_NAME = 'tool.name'
export const ATTR_TOOL_CALL_ID = 'tool_call.id'
export const ATTR_TOOL_CALL_FUNCTION_ARGUMENTS = 'tool_call.function.arguments'
export const ATTR_TOOL_CALL_FUNCTION_RESULT = 'tool_call.function.result'

export const ATTR_LLM_PROVIDER = 'llm.provider'
export const ATTR_LLM_SYSTEM = 'llm.system'
export const ATTR_LLM_MODEL_NAME = 'llm.model_name'

export const ATTR_LLM_TOKEN_COUNT_PROMPT = 'llm.token_count.prompt'
export const ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_INPUT = 'llm.token_count.prompt_details.cache_input' // prettier-ignore
export const ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_READ = 'llm.token_count.prompt_details.cache_read' // prettier-ignore
export const ATTR_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHE_WRITE = 'llm.token_count.prompt_details.cache_write' // prettier-ignore
export const ATTR_LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING = 'llm.token_count.completion_details.reasoning' // prettier-ignore
export const ATTR_LLM_TOKEN_COUNT_COMPLETION = 'llm.token_count.completion' // prettier-ignore

export const ATTR_LLM_INVOCATION_PARAMETERS = 'llm.invocation_parameters'

export const ATTR_LLM_INPUT_MESSAGES = 'llm.input_messages'
export const ATTR_LLM_OUTPUT_MESSAGES = 'llm.output_messages'

export const ATTR_LLM_PROMPTS = 'llm.prompts' // llm.prompts.{index}.{role/content/...}
export const ATTR_LLM_COMPLETIONS = 'llm.completions' // llm.completions.{index}.{role/content/...}

// https://github.com/traceloop/openllmetry/blob/main/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py
export const ATTR_LLM_REQUEST_TYPE = 'llm.request.type'
export const LLM_REQUEST_TYPE_VALUE_COMPLETION = 'completion'
export const LLM_REQUEST_TYPE_VALUE_CHAT = 'chat'
export const LLM_REQUEST_TYPE_VALUE_EMBEDDING = 'embedding'
export const LLM_REQUEST_TYPE_VALUE_RERANK = 'rerank'

export const ATTR_GEN_AI_USAGE_CACHE_CREATION_INPUT_TOKENS = 'gen_ai.usage.cache_creation_input_tokens' // prettier-ignore
export const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS = 'gen_ai.usage.cache_read_input_tokens' // prettier-ignore

export const ATTR_LLM_RESPONSE_FINISH_REASON = 'llm.response.finish_reason'
export const ATTR_LLM_RESPONSE_STOP_REASON = 'llm.response.stop_reason'

// https://ai-sdk.dev/docs/ai-sdk-core/telemetry#span-details
export const ATTR_AI_OPERATION_ID = 'ai.operationId'
export const AI_OPERATION_ID_VALUE_TOOL = 'ai.toolCall'
export const AI_OPERATION_ID_VALUE_GENERATE_TEXT = 'ai.generateText'
export const AI_OPERATION_ID_VALUE_GENERATE_TEXT_DO_GENERATE = 'ai.generateText.doGenerate' // prettier-ignore
export const AI_OPERATION_ID_VALUE_STREAM_TEXT = 'ai.streamText'
export const AI_OPERATION_ID_VALUE_STREAM_TEXT_DO_STREAM = 'ai.streamText.doStream' // prettier-ignore
export const AI_OPERATION_ID_VALUE_GENERATE_OBJECT = 'ai.generateObject'
export const AI_OPERATION_ID_VALUE_GENERATE_OBJECT_DO_GENERATE = 'ai.generateObject.doGenerate' // prettier-ignore
export const AI_OPERATION_ID_VALUE_STREAM_OBJECT = 'ai.streamObject'
export const AI_OPERATION_ID_VALUE_STREAM_OBJECT_DO_STREAM = 'ai.streamObject.doStream' // prettier-ignore

export const ATTR_AI_TOOL_CALL_NAME = 'ai.toolCall.name'
export const ATTR_AI_TOOL_CALL_ID = 'ai.toolCall.id'
export const ATTR_AI_TOOL_CALL_ARGS = 'ai.toolCall.args'
export const ATTR_AI_TOOL_CALL_RESULT = 'ai.toolCall.result'

export const ATTR_AI_MODEL_PROVIDER = 'ai.model.provider'
export const ATTR_AI_MODEL_ID = 'ai.model.id'
export const ATTR_AI_RESPONSE_MODEL = 'ai.response.model'

export const ATTR_AI_USAGE_PROMPT_TOKENS = 'ai.usage.promptTokens'
export const ATTR_AI_USAGE_COMPLETION_TOKENS = 'ai.usage.completionTokens'

export const ATTR_AI_RESPONSE_FINISH_REASON = 'ai.response.finishReason'

export const ATTR_AI_SETTINGS = 'ai.settings'

export const ATTR_AI_PROMPT_MESSAGES = 'ai.prompt.messages'
export const ATTR_AI_RESPONSE_TEXT = 'ai.response.text'
export const ATTR_AI_RESPONSE_OBJECT = 'ai.response.object'
export const ATTR_AI_RESPONSE_TOOL_CALLS = 'ai.response.toolCalls'

/* Note: Schemas for span ingestion following OpenTelemetry service request specification */

export namespace Otlp {
  export const attributeValueSchema = z.object({
    stringValue: z.string().optional(),
    intValue: z.number().optional(),
    boolValue: z.boolean().optional(),
    arrayValue: z
      .object({
        values: z.array(
          z.object({
            stringValue: z.string().optional(),
            intValue: z.number().optional(),
            boolValue: z.boolean().optional(),
          }),
        ),
      })
      .optional(),
  })
  export type AttributeValue = z.infer<typeof attributeValueSchema>

  export const attributeSchema = z.object({
    key: z.string(),
    value: attributeValueSchema,
  })
  export type Attribute = z.infer<typeof attributeSchema>

  export const eventSchema = z.object({
    name: z.string(),
    timeUnixNano: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Event = z.infer<typeof eventSchema>

  export const linkSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Link = z.infer<typeof linkSchema>

  export enum StatusCode {
    Unset = 0,
    Ok = 1,
    Error = 2,
  }

  export const statusSchema = z.object({
    code: z.number(),
    message: z.string().optional(),
  })
  export type Status = z.infer<typeof statusSchema>

  export enum SpanKind {
    Internal = 0,
    Server = 1,
    Client = 2,
    Producer = 3,
    Consumer = 4,
  }

  export const spanSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    parentSpanId: z.string().optional(),
    name: z.string(),
    kind: z.number(),
    startTimeUnixNano: z.string(),
    endTimeUnixNano: z.string(),
    status: statusSchema.optional(),
    events: z.array(eventSchema).optional(),
    links: z.array(linkSchema).optional(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Span = z.infer<typeof spanSchema>

  export const scopeSchema = z.object({
    name: z.string(),
    version: z.string().optional(),
  })
  export type Scope = z.infer<typeof scopeSchema>

  export const scopeSpanSchema = z.object({
    scope: scopeSchema,
    spans: z.array(spanSchema),
  })
  export type ScopeSpan = z.infer<typeof scopeSpanSchema>

  export const resourceSchema = z.object({
    attributes: z.array(attributeSchema),
  })
  export type Resource = z.infer<typeof resourceSchema>

  export const resourceSpanSchema = z.object({
    resource: resourceSchema,
    scopeSpans: z.array(scopeSpanSchema),
  })
  export type ResourceSpan = z.infer<typeof resourceSpanSchema>

  export const serviceRequestSchema = z.object({
    resourceSpans: z.array(resourceSpanSchema),
  })
  export type ServiceRequest = z.infer<typeof serviceRequestSchema>
}

export type SpanIngestionData = {
  ingestionId: string
  spans: Otlp.ResourceSpan[]
}

// prettier-ignore
export const SPAN_INGESTION_STORAGE_KEY = (
  ingestionId: string, // Note: using single id to avoid dangling folders
) => encodeURI(`ingest/traces/${ingestionId}`)

export type SpanProcessingData = {
  span: Otlp.Span
  scope: Otlp.Scope
  resource: Otlp.Resource
}

// prettier-ignore
export const SPAN_PROCESSING_STORAGE_KEY = (
  processingId: string, // Note: using single id to avoid dangling folders
) => encodeURI(`process/traces/${processingId}`)

export const TRACING_JOBS_MAX_ATTEMPTS = 3
export const TRACING_JOBS_DELAY_BETWEEN_CONFLICTS = () =>
  (Math.floor(Math.random() * 10) + 1) * 1000 // 1-10 random seconds in order to serialize conflicts (best effort)
