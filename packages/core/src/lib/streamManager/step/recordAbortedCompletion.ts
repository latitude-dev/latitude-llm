import { VercelConfig } from '@latitude-data/constants'
import type {
  AssistantMessage,
  Message,
} from '@latitude-data/constants/messages'
import { ProviderApiKey } from '../../../schema/models/types/ProviderApiKey'
import { telemetry, TelemetryContext } from '../../../telemetry'

/**
 * Records a completion span for an aborted stream.
 * This ensures partial output is visible in telemetry traces even when
 * the user cancels the request mid-stream.
 */
export function recordAbortedCompletion({
  context,
  provider,
  config,
  messages,
  accumulatedText,
  accumulatedReasoning,
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  config: VercelConfig
  messages: Message[]
  accumulatedText: string | null
  accumulatedReasoning: string | null
}): void {
  const $abortedCompletion = telemetry.span.completion(
    {
      provider: provider.provider,
      model: config.model,
      input: messages,
      configuration: config,
    },
    context,
  )

  const output: AssistantMessage = { role: 'assistant', content: [] }
  if (accumulatedReasoning !== null) {
    output.content.push({ type: 'reasoning', text: accumulatedReasoning })
  }
  if (accumulatedText !== null) {
    output.content.push({ type: 'text', text: accumulatedText })
  }

  $abortedCompletion.end({
    output: [output],
    finishReason: 'stop',
    tokens: {},
  })
}
