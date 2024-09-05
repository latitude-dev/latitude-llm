import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { createProviderLog } from '@latitude-data/core/services/providerLogs/create'
import { messageSchema } from '$/common/messageSchema'
import { pipeToStream } from '$/common/pipeToStream'
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
        providerLogHandler: async (log) => {
          await createProviderLog({
            ...log,
            source,
            apiKeyId: apiKey.id,
          }).then((r) => r.unwrap())
        },
      }).then((r) => r.unwrap())

      await pipeToStream(stream, result.stream)
    })
  },
)
