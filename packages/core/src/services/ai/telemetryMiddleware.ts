import { Message } from '@latitude-data/constants/messages'
import { ResolvedToolsDict } from '@latitude-data/constants/tools'
import { context as otelContext } from '@opentelemetry/api'
import type { LanguageModelMiddleware } from 'ai'
import { Provider, Translator } from 'rosetta-ai'
import { telemetry, TelemetryContext } from '../../telemetry'
import { captureException } from '../../utils/datadogCapture'
import { unwrapProviderMetadata } from './metadata'
import {
  createStreamConsumer,
  extractGenerateResultContent,
} from './streamConsumer'

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'passthrough',
})

export function createTelemetryMiddleware({
  context,
  providerName,
  model,
  resolvedTools,
}: {
  context: TelemetryContext
  providerName: string
  model: string
  resolvedTools?: ResolvedToolsDict
}): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      const unwrappedPrompt = unwrapProviderMetadata(params.prompt)

      const translating = translator.safeTranslate(unwrappedPrompt, {
        from: Provider.VercelAI,
        to: Provider.Promptl,
        direction: 'input',
      })
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]
      const inputMessages = addToolSourceData(translated, resolvedTools)

      const $completion = telemetry.span.completion(
        {
          provider: providerName,
          model,
          input: inputMessages,
          configuration: {
            model,
            ...((params as Record<string, unknown>) ?? {}),
          },
        },
        context,
      )

      try {
        // Run doGenerate within the completion span's context so HTTP spans become children
        const result = await otelContext.with($completion.context, () =>
          doGenerate(),
        )

        const captured = extractGenerateResultContent(result)
        const outputMessages = addToolSourceData(captured.output, resolvedTools)

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
      const unwrappedPrompt = unwrapProviderMetadata(params.prompt)

      const translating = translator.safeTranslate(unwrappedPrompt, {
        from: Provider.VercelAI,
        to: Provider.Promptl,
        direction: 'input',
      })
      if (translating.error) captureException(translating.error)
      const translated = (translating.messages ?? []) as Message[]
      const inputMessages = addToolSourceData(translated, resolvedTools)

      const $completion = telemetry.span.completion(
        {
          provider: providerName,
          model,
          input: inputMessages,
          configuration: {
            model,
            ...((params as Record<string, unknown>) ?? {}),
          },
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
            const outputMessages = addToolSourceData(
              captured.output,
              resolvedTools,
            )
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

function addToolSourceData(
  messages: Message[],
  resolvedTools?: ResolvedToolsDict,
) {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message
    if (!Array.isArray(message.content)) return message

    for (const content of message.content) {
      if (content.type !== 'tool-call') continue
      if (content._sourceData) continue
      content._sourceData = resolvedTools?.[content.toolName]?.sourceData
    }

    return message
  })
}
