import { zValidator } from '@hono/zod-validator'
import { addMessages, LogSources } from '@latitude-data/core'
import { messageSchema } from '$/common/messageSchema'
import { pipeToStream } from '$/common/pipeToStream'
import { queues } from '$/jobs'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

const factory = new Factory()

const schema = z.object({
  messages: z.array(messageSchema),
  documentLogUuid: z.string(),
  source: z.nativeEnum(LogSources).optional().default(LogSources.API),
})

export const addMessageHandler = factory.createHandlers(
  zValidator('json', schema),
  async (c) => {
    return streamSSE(c, async (stream) => {
      const { documentLogUuid, messages, source } = c.req.valid('json')
      const workspace = c.get('workspace')
      const apiKey = c.get('apiKey')

      const result = await addMessages({
        workspace,
        documentLogUuid,
        messages,
        providerLogHandler: (log) => {
          queues.defaultQueue.jobs.enqueueCreateProviderLogJob({
            ...log,
            source,
            apiKeyId: apiKey.id,
          })
        },
      }).then((r) => r.unwrap())

      await pipeToStream(stream, result.stream)
    })
  },
)
