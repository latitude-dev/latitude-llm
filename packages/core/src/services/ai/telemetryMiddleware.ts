import type { LanguageModelMiddleware } from 'ai'
import { context as otelContext } from '@opentelemetry/api'
import { telemetry, TelemetryContext } from '../../telemetry'
import {
  createStreamConsumer,
  buildOutputMessages,
  extractGenerateResultContent,
} from './streamConsumer'

function convertPromptToMessages(
  prompt: unknown,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(prompt)) return undefined

  return prompt.map((item) => {
    if (typeof item === 'object' && item !== null) {
      return item as Record<string, unknown>
    }
    return { content: String(item) }
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
