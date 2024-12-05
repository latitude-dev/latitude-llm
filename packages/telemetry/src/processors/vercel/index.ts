import {
  ReadableSpan,
  SimpleSpanProcessor,
  SpanProcessor,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-base'
import type { ToolCallPart } from 'ai'

import { AISemanticConventions } from './conventions'

export class VercelSpanProcessor
  extends SimpleSpanProcessor
  implements SpanProcessor
{
  onEnd(span: ReadableSpan): void {
    if (!shouldProcess(span)) return
    if (shouldConvertToLatitudeFormat(span)) convertToLatitudeFormat(span)

    super.onEnd(span)
  }
}

export class VercelBatchSpanProcessor
  extends BatchSpanProcessor
  implements SpanProcessor
{
  onEnd(span: ReadableSpan): void {
    if (!shouldProcess(span)) return
    if (shouldConvertToLatitudeFormat(span)) convertToLatitudeFormat(span)

    super.onEnd(span)
  }
}

function shouldProcess(span: ReadableSpan): boolean {
  return (
    Object.keys(span.attributes).some((k) => k.startsWith('latitude.')) ||
    Object.keys(span.attributes).some((k) => k.startsWith('ai.'))
  )
}

function shouldConvertToLatitudeFormat(span: ReadableSpan): boolean {
  return Object.keys(span.attributes).some((k) => k.startsWith('ai.'))
}

function convertToLatitudeFormat(span: ReadableSpan): void {
  try {
    const computedAttrs = computeOpenLLMAttributes(span)
    if (computedAttrs) {
      ;(span as any).attributes = {
        ...span.attributes,
        ...computedAttrs,
      }
    }
  } catch (e) {
    console.log('Latitude telemetry Error: ', e)
    // do nothing
  }
}

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
