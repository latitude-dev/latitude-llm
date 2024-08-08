'use server'

import { Message } from '@latitude-data/compiler'
import {
  ai,
  ProviderApiKeysRepository,
  streamToGenerator,
  validateConfig,
} from '@latitude-data/core'
import { LogSources, StreamEventTypes } from '@latitude-data/core/browser'
import { queues } from '$/jobs'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { createStreamableValue, StreamableValue } from 'ai/rsc'

type StreamTextActionProps = {
  messages: Message[]
  config: Record<string, unknown>
}

type StreamTextActionResponse = Promise<{ output: StreamableValue }>
export type StreamTextOutputAction = (
  _: StreamTextActionProps,
) => StreamTextActionResponse

export async function streamTextAction({
  config,
  messages,
}: StreamTextActionProps): StreamTextActionResponse {
  const { workspace } = await getCurrentUser()
  const { provider, ...rest } = validateConfig(config)
  const providerApiKeysScope = new ProviderApiKeysRepository(workspace.id)
  const apiKey = await providerApiKeysScope
    .findByName(provider)
    .then((r) => r.unwrap())
  const stream = createStreamableValue()

  ;(async () => {
    try {
      const result = await ai(
        {
          provider: apiKey,
          messages,
          config: rest,
        },
        {
          logHandler: (log) => {
            queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
              ...log,
              source: LogSources.Playground,
            })
          },
        },
      )

      for await (const value of streamToGenerator(result.fullStream)) {
        stream.update({
          event: StreamEventTypes.Provider,
          data: value,
        })
      }

      stream.done()
    } catch (error) {
      const err = error as Error
      stream.error({
        name: err.name,
        message: err.message,
        stack: err.stack,
      })
    }
  })()

  return {
    output: stream.value,
  }
}
