// TODO(tracing): implement

// import {
//   ATTR_GEN_AI_OPERATION_NAME,
//   ATTR_GEN_AI_USAGE_COMPLETION_TOKENS,
//   ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
//   GEN_AI_OPERATION_NAME_VALUE_CHAT,
//   GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS,
//   GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION,
// } from '@opentelemetry/semantic-conventions/incubating'
// import {
//   ATTR_GEN_AI_TOOL_CALL_ID,
//   ATTR_LATITUDE_TYPE,
//   ATTR_LLM_REQUEST_TYPE,
//   GEN_AI_OPERATION_NAME_VALUE_COMPLETION,
//   GEN_AI_OPERATION_NAME_VALUE_EMBEDDING,
//   GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL,
//   GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT,
//   GEN_AI_OPERATION_NAME_VALUE_RERANKING,
//   GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL,
//   GEN_AI_OPERATION_NAME_VALUE_TOOL,
//   LLM_REQUEST_TYPE_VALUE_CHAT,
//   LLM_REQUEST_TYPE_VALUE_COMPLETION,
//   LLM_REQUEST_TYPE_VALUE_EMBEDDING,
//   LLM_REQUEST_TYPE_VALUE_RERANK,
//   SpanAttribute,
//   SpanType,
// } from '../../browser'

// export function extractSpanType(
//   attributes: Record<string, SpanAttribute>,
// ): SpanType {
//   const type = String(attributes[ATTR_LATITUDE_TYPE] || '')
//   switch (type) {
//     case SpanType.Tool:
//       return SpanType.Tool
//     case SpanType.Completion:
//       return SpanType.Completion
//     case SpanType.Embedding:
//       return SpanType.Embedding
//     case SpanType.Retrieval:
//       return SpanType.Retrieval
//     case SpanType.Reranking:
//       return SpanType.Reranking
//     case SpanType.Unknown:
//       return SpanType.Unknown
//   }

//   const operation = String(attributes[ATTR_GEN_AI_OPERATION_NAME] || '')
//   switch (operation) {
//     case GEN_AI_OPERATION_NAME_VALUE_TOOL:
//     case GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL:
//       return SpanType.Tool
//     case GEN_AI_OPERATION_NAME_VALUE_COMPLETION:
//     case GEN_AI_OPERATION_NAME_VALUE_CHAT:
//     case GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION:
//     case GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT:
//       return SpanType.Completion
//     case GEN_AI_OPERATION_NAME_VALUE_EMBEDDING:
//     case GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS:
//       return SpanType.Embedding
//     case GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL:
//       return SpanType.Retrieval
//     case GEN_AI_OPERATION_NAME_VALUE_RERANKING:
//       return SpanType.Reranking
//   }

//   const requestType = String(attributes[ATTR_LLM_REQUEST_TYPE] || '')
//   switch (requestType) {
//     case LLM_REQUEST_TYPE_VALUE_COMPLETION:
//     case LLM_REQUEST_TYPE_VALUE_CHAT:
//       return SpanType.Completion
//     case LLM_REQUEST_TYPE_VALUE_EMBEDDING:
//       return SpanType.Embedding
//     case LLM_REQUEST_TYPE_VALUE_RERANK:
//       return SpanType.Reranking
//   }

//   if (ATTR_GEN_AI_USAGE_COMPLETION_TOKENS in attributes) {
//     return SpanType.Completion
//   }

//   if (ATTR_GEN_AI_USAGE_OUTPUT_TOKENS in attributes) {
//     return SpanType.Completion
//   }

//   if (ATTR_GEN_AI_TOOL_CALL_ID in attributes) {
//     return SpanType.Tool
//   }

//   return SpanType.Unknown
// }

// TODO(tracing): more extractSpanX functions

// TODO(tracing): convert to attribute extractors
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
