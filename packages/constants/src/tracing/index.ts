import { z } from 'zod'

export * from './segment'
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

export const ATTR_LATITUDE_EXTERNAL_ID = `${ATTR_LATITUDE}.external.id`
export const ATTR_LATITUDE_SOURCE = `${ATTR_LATITUDE}.source`
export const ATTR_LATITUDE_TYPE = `${ATTR_LATITUDE}.type`

export const ATTR_LATITUDE_SEGMENT_ID = `${ATTR_LATITUDE}.segment.id`
export const ATTR_LATITUDE_SEGMENT_PARENT_ID = `${ATTR_LATITUDE}.segment.parent_id`
export const ATTR_LATITUDE_SEGMENTS = `${ATTR_LATITUDE}.segments`

export const GEN_AI_TOOL_TYPE_VALUE_FUNCTION = 'function'
export const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = 'gen_ai.tool.call.arguments'
export const ATTR_GEN_AI_TOOL_RESULT_VALUE = 'gen_ai.tool.result.value'
export const ATTR_GEN_AI_TOOL_RESULT_IS_ERROR = 'gen_ai.tool.result.is_error'

export const ATTR_GEN_AI_REQUEST = 'gen_ai.request'
export const ATTR_GEN_AI_REQUEST_CONFIGURATION = 'gen_ai.request.configuration'
export const ATTR_GEN_AI_REQUEST_TEMPLATE = 'gen_ai.request.template'
export const ATTR_GEN_AI_REQUEST_PARAMETERS = 'gen_ai.request.parameters'
export const ATTR_GEN_AI_REQUEST_MESSAGES = 'gen_ai.request.messages'
export const ATTR_GEN_AI_RESPONSE = 'gen_ai.response'
export const ATTR_GEN_AI_RESPONSE_MESSAGES = 'gen_ai.response.messages'

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
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_TOOL_CALLS = 'tool_calls'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_LENGTH = 'length'
export const GEN_AI_RESPONSE_FINISH_REASON_VALUE_ERROR = 'error'

export const ATTR_HTTP_REQUEST_URL = 'http.request.url'
export const ATTR_HTTP_REQUEST_BODY = 'http.request.body'
export const ATTR_HTTP_REQUEST_HEADERS = 'http.request.header'
export const ATTR_HTTP_RESPONSE_BODY = 'http.response.body'
export const ATTR_HTTP_RESPONSE_HEADERS = 'http.response.header'

/* Note: non-standard OpenTelemetry semantic conventions used in other systems */

// https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/schemas.py
export const GEN_AI_OPERATION_NAME_VALUE_TOOL = 'tool'
export const GEN_AI_OPERATION_NAME_VALUE_COMPLETION = 'completion'
export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDING = 'embedding'
export const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = 'retrieval'
export const GEN_AI_OPERATION_NAME_VALUE_RERANKING = 'reranking'

// https://github.com/traceloop/openllmetry/blob/main/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py
export const ATTR_LLM_REQUEST_TYPE = 'llm.request.type'
export const LLM_REQUEST_TYPE_VALUE_COMPLETION = 'completion'
export const LLM_REQUEST_TYPE_VALUE_CHAT = 'chat'
export const LLM_REQUEST_TYPE_VALUE_EMBEDDING = 'embedding'
export const LLM_REQUEST_TYPE_VALUE_RERANK = 'rerank'

/* Note: Schemas for span ingestion following OpenTelemetry service request specification */

export namespace Otlp {
  const attributeValueSchema = z.object({
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

  const attributeSchema = z.object({
    key: z.string(),
    value: attributeValueSchema,
  })
  export type Attribute = z.infer<typeof attributeSchema>

  const eventSchema = z.object({
    name: z.string(),
    timeUnixNano: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Event = z.infer<typeof eventSchema>

  const linkSchema = z.object({
    traceId: z.string(),
    spanId: z.string(),
    attributes: z.array(attributeSchema).optional(),
  })
  export type Link = z.infer<typeof linkSchema>

  const statusSchema = z.object({
    code: z.number(),
    message: z.string().optional(),
  })
  export type Status = z.infer<typeof statusSchema>

  const spanSchema = z.object({
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

  const scopeSchema = z.object({
    name: z.string(),
    version: z.string().optional(),
  })
  export type Scope = z.infer<typeof scopeSchema>

  const scopeSpanSchema = z.object({
    scope: scopeSchema,
    spans: z.array(spanSchema),
  })
  export type ScopeSpan = z.infer<typeof scopeSpanSchema>

  const resourceSchema = z.object({
    attributes: z.array(attributeSchema),
  })
  export type Resource = z.infer<typeof resourceSchema>

  const resourceSpanSchema = z.object({
    resource: resourceSchema,
    scopeSpans: z.array(scopeSpanSchema),
  })
  export type ResourceSpan = z.infer<typeof resourceSpanSchema>

  const serviceRequestSchema = z.object({
    resourceSpans: z.array(resourceSpanSchema),
  })
  export type ServiceRequest = z.infer<typeof serviceRequestSchema>
}
