import type { LanguageModelMiddleware } from 'ai'
import { context as otelContext } from '@opentelemetry/api'
import { telemetry, TelemetryContext } from '../../telemetry'
import {
  createStreamConsumer,
  buildOutputMessages,
  extractGenerateResultContent,
} from './streamConsumer'
import { LanguageModelV2Prompt } from '@ai-sdk/provider'
import {
  AssistantMessage,
  Message,
  MessageContent,
  MessageRole,
} from '@latitude-data/constants/legacyCompiler'

function convertPromptToMessages(
  vercelMessages: LanguageModelV2Prompt,
): Message[] {
  return vercelMessages.map((msg) => {
    const finalMessage = {
      role: msg.role as MessageRole,
      content: [],
      toolCalls: [],
    } as AssistantMessage

    if (typeof msg.content === 'string') {
      finalMessage.content = [{ type: 'text', text: msg.content }]
      return finalMessage
    }

    const content: MessageContent[] = []

    msg.content.map((c) => {
      if (c.type === 'text') {
        content.push({ type: 'text', text: c.text })
      }

      if (c.type === 'file') {
        content.push({ type: 'file', file: c.data, mimeType: c.mediaType })
      }

      if (c.type === 'tool-call') {
        content.push({
          type: 'tool-call',
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          args: c.input as Record<string, unknown>,
        })
      }

      if (c.type === 'tool-result') {
        content.push({
          type: 'tool-result',
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          result: c.output.value,
          isError: ['error-json', 'error-text'].includes(c.output.type),
        })
      }

      if (c.type === 'reasoning') {
        content.push({ type: 'reasoning', text: c.text })
      }

      if (c.type === 'reasoning') {
        content.push({ type: 'reasoning', text: c.text })
      }

      return content
    })

    finalMessage.content = content
    return finalMessage
  })
}

export function createTelemetryMiddleware({
  context,
  providerName,
  model,
  promptUuid,
  versionUuid,
  experimentUuid,
}: {
  context: TelemetryContext
  providerName: string
  model: string
  promptUuid?: string
  versionUuid?: string
  experimentUuid?: string
}): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      const inputMessages = convertPromptToMessages(params.prompt)

      const $completion = telemetry.span.completion(
        {
          provider: providerName,
          model,
          input: inputMessages,
          configuration: {
            model,
            ...((params as Record<string, unknown>) ?? {}),
          },
          promptUuid,
          versionUuid,
          experimentUuid,
        },
        context,
      )

      try {
        // Run doGenerate within the completion span's context so HTTP spans become children
        const result = await otelContext.with($completion.context, () =>
          doGenerate(),
        )

        const captured = extractGenerateResultContent(result)
        const outputMessages = buildOutputMessages(captured)

        $completion.end({
          output: outputMessages,
          tokens: captured.tokens,
          finishReason: captured.finishReason,
        })

        return result
      } catch (error) {
        $completion.fail(error as Error)
        throw error
      }
    },

    wrapStream: async ({ doStream, params }) => {
      console.log(params.prompt)
      const inputMessages = convertPromptToMessages(params.prompt)

      const $completion = telemetry.span.completion(
        {
          provider: providerName,
          model,
          input: inputMessages,
          configuration: {
            model,
            ...((params as Record<string, unknown>) ?? {}),
          },
          promptUuid,
          versionUuid,
          experimentUuid,
        },
        context,
      )

      try {
        // Run doStream within the completion span's context so HTTP spans become children
        const result = await otelContext.with($completion.context, () =>
          doStream(),
        )

        const wrappedStream = result.stream.pipeThrough(
          createStreamConsumer((captured) => {
            const outputMessages = buildOutputMessages(captured)

            $completion.end({
              output: outputMessages,
              tokens: captured.tokens,
              finishReason: captured.finishReason,
            })
          }),
        )

        return { ...result, stream: wrappedStream }
      } catch (error) {
        $completion.fail(error as Error)
        throw error
      }
    },
  }
}
