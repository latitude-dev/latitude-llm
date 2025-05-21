import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_USAGE_COMPLETION_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_OPERATION_NAME_VALUE_CHAT,
  GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
  GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
} from '@opentelemetry/semantic-conventions/incubating'
import { z } from 'zod'
import { SpanAttribute, SpanType } from './span'

export * from './segment'
export * from './span'
export * from './trace'

/* Note: non-standard OpenTelemetry semantic conventions used in Latitude */

export const ATTR_LATITUDE = 'latitude'

export const ATTR_LATITUDE_EXTERNAL_ID = `${ATTR_LATITUDE}.external_id`
export const ATTR_LATITUDE_SOURCE = `${ATTR_LATITUDE}.source`
export const ATTR_LATITUDE_TYPE = `${ATTR_LATITUDE}.type`

export const ATTR_LATITUDE_VERSION_UUID = `${ATTR_LATITUDE}.version_uuid`
export const ATTR_LATITUDE_DOCUMENT_UUID = `${ATTR_LATITUDE}.document_uuid`
export const ATTR_LATITUDE_DOCUMENT_TYPE = `${ATTR_LATITUDE}.document_type`
export const ATTR_LATITUDE_EXPERIMENT_UUID = `${ATTR_LATITUDE}.experiment_uuid`
export const ATTR_LATITUDE_PROMPT_HASH = `${ATTR_LATITUDE}.prompt_hash`

export const ATTR_LATITUDE_TOOL_ARGUMENTS = `${ATTR_LATITUDE}.tool.arguments`
export const ATTR_LATITUDE_TOOL_RESULT = `${ATTR_LATITUDE}.tool.result`

export const ATTR_LATITUDE_HTTP_REQUEST = `${ATTR_LATITUDE}.http.request`
export const ATTR_LATITUDE_HTTP_RESPONSE = `${ATTR_LATITUDE}.http.response`

export const ATTR_LATITUDE_SEGMENT = `${ATTR_LATITUDE}.segment`
export const ATTR_LATITUDE_SEGMENT_ID = `${ATTR_LATITUDE_SEGMENT}.id`
export const ATTR_LATITUDE_SEGMENT_PARENT_ID = `${ATTR_LATITUDE_SEGMENT}.parent_id`
export const ATTR_LATITUDE_SEGMENT_NAME = `${ATTR_LATITUDE_SEGMENT}.name`
export const ATTR_LATITUDE_SEGMENT_TYPE = `${ATTR_LATITUDE_SEGMENT}.type`

/* Note: non-standard OpenTelemetry semantic conventions used in other systems */

// https://github.com/open-telemetry/opentelemetry-python/blob/main/opentelemetry-semantic-conventions/src/opentelemetry/semconv/_incubating/attributes/gen_ai_attributes.py
export const ATTR_GEN_AI_TOOL_CALL_ID = 'gen_ai.tool.call.id'
export const GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT = 'generate_content'
export const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = 'execute_tool'

// https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/schemas.py
export const GEN_AI_OPERATION_NAME_VALUE_TOOL = 'tool'
export const GEN_AI_OPERATION_NAME_VALUE_COMPLETION = 'completion'
export const GEN_AI_OPERATION_NAME_VALUE_EMBEDDING = 'embedding'
export const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = 'retrieval'
export const GEN_AI_OPERATION_NAME_VALUE_RERANKING = 'reranking'

// https://github.com/traceloop/openllmetry/blob/main/packages/opentelemetry-semantic-conventions-ai/opentelemetry/semconv_ai/__init__.py
export const ATTR_LLM_REQUEST_TYPE = 'llm.request.type'
export const LLM_REQUEST_TYPE_COMPLETION = 'completion'
export const LLM_REQUEST_TYPE_CHAT = 'chat'
export const LLM_REQUEST_TYPE_EMBEDDING = 'embedding'
export const LLM_REQUEST_TYPE_RERANK = 'rerank'

// TODO(tracing): move out of here
export function getSpanTypeFromAttributes(
  attributes: Record<string, SpanAttribute>,
): SpanType {
  const type = String(attributes[ATTR_LATITUDE_TYPE] || '')
  switch (type) {
    case SpanType.Tool:
      return SpanType.Tool
    case SpanType.Completion:
      return SpanType.Completion
    case SpanType.Embedding:
      return SpanType.Embedding
    case SpanType.Retrieval:
      return SpanType.Retrieval
    case SpanType.Reranking:
      return SpanType.Reranking
    case SpanType.Unknown:
      return SpanType.Unknown
  }

  const operation = String(attributes[ATTR_GEN_AI_OPERATION_NAME] || '')
  switch (operation) {
    case GEN_AI_OPERATION_NAME_VALUE_TOOL:
    case GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL:
      return SpanType.Tool
    case GEN_AI_OPERATION_NAME_VALUE_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_CHAT:
    case GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION:
    case GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT:
      return SpanType.Completion
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDING:
    case GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS:
      return SpanType.Embedding
    case GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL:
    case GEN_AI_OPERATION_NAME_VALUE_RERANKING:
      return SpanType.Reranking
  }

  const requestType = String(attributes[ATTR_LLM_REQUEST_TYPE] || '')
  switch (requestType) {
    case LLM_REQUEST_TYPE_COMPLETION:
    case LLM_REQUEST_TYPE_CHAT:
      return SpanType.Completion
    case LLM_REQUEST_TYPE_EMBEDDING:
      return SpanType.Embedding
    case LLM_REQUEST_TYPE_RERANK:
      return SpanType.Reranking
  }

  if (ATTR_GEN_AI_USAGE_COMPLETION_TOKENS in attributes) {
    return SpanType.Completion
  }

  if (ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in attributes) {
    return SpanType.Completion
  }

  if (ATTR_GEN_AI_TOOL_CALL_ID in attributes) {
    return SpanType.Tool
  }

  return SpanType.Unknown
}

// TODO(tracing): more getSpanXFromAttributes functions

// TODO(tracing): move out of here
/*
function computeOpenLLMAttributes(span: ReadableSpan) {
  const attrs = span.attributes || {}
  const result: Record<string, string | number | boolean> = {}

  // Extract model information
  if (attrs[AISemanticConventions.MODEL_ID]) {
    result['gen_ai.request.model'] = String(
      attrs[AISemanticConventions.MODEL_ID],
    )
    result['gen_ai.response.model'] = String(
      attrs[AISemanticConventions.MODEL_ID],
    )
  }

  // Extract settings
  try {
    const settings = attrs[AISemanticConventions.SETTINGS]
      ? JSON.parse(String(attrs[AISemanticConventions.SETTINGS]))
      : {}

    if (settings) {
      // Add max tokens if present
      if (settings.maxTokens) {
        result['gen_ai.request.max_tokens'] = settings.maxTokens
      }

      if (!attrs['gen_ai.system'] && settings.provider) {
        result['gen_ai.system'] = String(settings.provider)
      }
    }
  } catch (e) {
    console.error('Error parsing settings', e)
  }

  // Set request type to chat as that's what Vercel AI SDK uses
  result['llm.request.type'] = 'chat'

  // Extract messages
  try {
    const messages = attrs['ai.prompt.messages']
      ? JSON.parse(String(attrs['ai.prompt.messages']))
      : []

    // Process prompt messages
    messages.forEach((msg: any, index: number) => {
      result[`gen_ai.prompt.${index}.role`] = msg.role
      result[`gen_ai.prompt.${index}.content`] =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content)
    })
  } catch (e) {
    console.error('Error parsing messages', e)

    return undefined
  }

  // Extract completion/response
  const responseText = attrs['ai.response.text']
  const responseObject = attrs['ai.response.object']
  const responseToolCalls = attrs['ai.response.toolCalls']
  if (responseText) {
    result[`gen_ai.completion.0.role`] = 'assistant'
    result[`gen_ai.completion.0.content`] = String(responseText)
  } else if (responseToolCalls) {
    try {
      const toolCalls = JSON.parse(String(responseToolCalls))
      if (toolCalls.length > 0) {
        result['gen_ai.completion.0.finish_reason'] = 'tool_calls'
        result[`gen_ai.completion.0.role`] = 'assistant'

        toolCalls.forEach((toolCall: ToolCallPart, toolCallIndex: number) => {
          result[`gen_ai.completion.0.tool_calls.${toolCallIndex}.id`] =
            toolCall.toolCallId
          result[`gen_ai.completion.0.tool_calls.${toolCallIndex}.name`] =
            toolCall.toolName
          result[`gen_ai.completion.0.tool_calls.${toolCallIndex}.arguments`] =
            toolCall.args as string
        })
      }
    } catch (e) {
      console.error('Error parsing tool calls', e)
    }
  } else if (responseObject) {
    result['gen_ai.completion.0.role'] = 'assistant'
    result['gen_ai.completion.0.content'] = String(responseObject)
  }

  // Extract token usage
  const completionTokens = attrs['ai.usage.completionTokens']
  const promptTokens = attrs['ai.usage.promptTokens']

  if (typeof completionTokens === 'number') {
    result['gen_ai.usage.completion_tokens'] = completionTokens
  }
  if (typeof promptTokens === 'number') {
    result['gen_ai.usage.prompt_tokens'] = promptTokens
  }
  if (
    typeof completionTokens === 'number' &&
    typeof promptTokens === 'number'
  ) {
    result['llm.usage.total_tokens'] = completionTokens + promptTokens
  }

  return result
}

    def _enrich_semantics(self, attributes: Dict[str, Any]) -> Dict[str, Any]:
        otel_attributes: Dict[str, Any] = {}

        if oinfsem.SpanAttributes.LLM_SYSTEM in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_SYSTEM] = attributes[oinfsem.SpanAttributes.LLM_SYSTEM]

        if (
            oinfsem.SpanAttributes.LLM_PROVIDER in attributes
            and otelsem.SpanAttributes.LLM_SYSTEM not in otel_attributes
        ):
            otel_attributes[otelsem.SpanAttributes.LLM_SYSTEM] = attributes[oinfsem.SpanAttributes.LLM_PROVIDER]

        if oinfsem.SpanAttributes.LLM_MODEL_NAME in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_MODEL] = attributes[
                oinfsem.SpanAttributes.LLM_MODEL_NAME
            ]
            otel_attributes[otelsem.SpanAttributes.LLM_RESPONSE_MODEL] = attributes[
                oinfsem.SpanAttributes.LLM_MODEL_NAME
            ]

        if otelsem.SpanAttributes.LLM_REQUEST_TYPE not in attributes and (
            otelsem.SpanAttributes.LLM_REQUEST_MODEL in attributes
            or oinfsem.SpanAttributes.LLM_MODEL_NAME in attributes
        ):
            otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TYPE] = otelsem.LLMRequestTypeValues.COMPLETION.value

        if oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS in attributes:
            if "max_tokens" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_MAX_TOKENS] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["max_tokens"]

            if "temperature" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TEMPERATURE] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["temperature"]

            if "top_p" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_REQUEST_TOP_P] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["top_p"]

            if "top_k" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_TOP_K] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["top_k"]

            if "frequency_penalty" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_FREQUENCY_PENALTY] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["frequency_penalty"]

            if "presence_penalty" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_PRESENCE_PENALTY] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["presence_penalty"]

            if "stop_sequences" in attributes[oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS]:
                otel_attributes[otelsem.SpanAttributes.LLM_CHAT_STOP_SEQUENCES] = attributes[
                    oinfsem.SpanAttributes.LLM_INVOCATION_PARAMETERS
                ]["stop_sequences"]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_PROMPT in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_PROMPT_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_PROMPT
            ]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_COMPLETION in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_COMPLETION_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_COMPLETION
            ]

        if oinfsem.SpanAttributes.LLM_TOKEN_COUNT_TOTAL in attributes:
            otel_attributes[otelsem.SpanAttributes.LLM_USAGE_TOTAL_TOKENS] = attributes[
                oinfsem.SpanAttributes.LLM_TOKEN_COUNT_TOTAL
            ]

        for message in filter(
            lambda key: key.startswith(oinfsem.SpanAttributes.LLM_INPUT_MESSAGES),
            attributes.keys(),
        ):
            parts = message.split(".")
            index = parts[2]
            fields = ".".join(parts[4:])
            otel_attributes[f"{otelsem.SpanAttributes.LLM_PROMPTS}.{index}.{fields}"] = attributes[message]

        for message in filter(
            lambda key: key.startswith(oinfsem.SpanAttributes.LLM_OUTPUT_MESSAGES),
            attributes.keys(),
        ):
            parts = message.split(".")
            index = parts[2]
            fields = ".".join(parts[4:])
            otel_attributes[f"{otelsem.SpanAttributes.LLM_COMPLETIONS}.{index}.{fields}"] = attributes[message]

        return {**attributes, **otel_attributes}
*/

/* Note: Schemas for span ingestion following OpenTelemetry service request specification */

export namespace Otlp {
  const attributeValueSchema = z.object({
    stringValue: z.string().optional(),
    intValue: z.number().optional(),
    boolValue: z.boolean().optional(),
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
