import {
  ReadableSpan,
  SimpleSpanProcessor,
  SpanExporter,
} from '@opentelemetry/sdk-trace-base'

import { AISemanticConventions } from './conventions'

export class VercelSpanProcessor extends SimpleSpanProcessor {
  constructor(config: { exporter: SpanExporter }) {
    super(config.exporter)
  }

  computeOpenLLMAttributes(span: ReadableSpan) {
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
    const settings = attrs[AISemanticConventions.SETTINGS]
      ? JSON.parse(String(attrs[AISemanticConventions.SETTINGS]))
      : {}

    if (settings) {
      // Add max tokens if present
      if (settings.maxTokens) {
        result['gen_ai.request.max_tokens'] = settings.maxTokens
      }
    }

    // Set request type to chat as that's what Vercel AI SDK uses
    result['llm.request.type'] = 'chat'

    // Extract provider (system)
    if (settings?.provider) {
      result['gen_ai.system'] = String(settings.provider)
    }

    // Extract messages
    const messages = attrs[AISemanticConventions.PROMPT_MESSAGES]
      ? JSON.parse(String(attrs[AISemanticConventions.PROMPT_MESSAGES]))
      : []

    // Process prompt messages
    messages.forEach((msg: any, index: number) => {
      result[`gen_ai.prompt.${index}.role`] = msg.role
      result[`gen_ai.prompt.${index}.content`] =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content)
    })

    // Extract completion/response
    const responseText = attrs[AISemanticConventions.RESPONSE_TEXT]
    if (responseText) {
      result[`gen_ai.completion.0.role`] = 'assistant'
      result[`gen_ai.completion.0.content`] = String(responseText)
    }

    const responseToolCalls = attrs[AISemanticConventions.RESPONSE_TOOL_CALLS]
    if (responseToolCalls) {
      result[`gen_ai.completion.0.role`] = 'assistant'
      result[`gen_ai.completion.0.tool_calls`] =
        JSON.stringify(responseToolCalls)
    }

    // Extract token usage
    const completionTokens = attrs[AISemanticConventions.TOKEN_COUNT_COMPLETION]
    const promptTokens = attrs[AISemanticConventions.TOKEN_COUNT_PROMPT]

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

  onEnd(span: ReadableSpan): void {
    // Skip if the span doesn't have any AI attributes
    if (!Object.keys(span.attributes).some((k) => k.startsWith('ai.'))) return

    try {
      ;(span as any).attributes = {
        ...span.attributes,
        ...this.computeOpenLLMAttributes(span),
      }

      super.onEnd(span)
    } catch (e) {
      // do nothing
    }
  }
}
