import type { Message } from '@latitude-data/constants/messages'
import { VercelConfig } from '@latitude-data/constants'
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
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  config: VercelConfig
  messages: Message[]
  accumulatedText: string
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
  $abortedCompletion.end({
    output: [
      {
        role: 'assistant',
        content: [{ type: 'text', text: accumulatedText }],
      },
    ],
    finishReason: 'stop',
    tokens: {},
  })
}
