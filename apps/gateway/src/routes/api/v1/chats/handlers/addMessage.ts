import { zValidator } from '@hono/zod-validator'
import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { messageSchema } from '$/common/messageSchema'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { chainEventPresenter } from '../../projects/:projectId/commits/:commitUuid/documents/handlers/_shared'

const factory = new Factory()

const schema = z.object({
  messages: z.array(messageSchema),
  uuid: z.string(),
})

export const addMessageHandler = factory.createHandlers(
  zValidator('json', schema),
  async (c) => {
    return streamSSE(
      c,
      async (stream) => {
        const { uuid, messages } = c.req.valid('json')
        const workspace = c.get('workspace')

        const result = await addMessages({
          workspace,
          documentLogUuid: uuid,
          messages,
          source: LogSources.API,
        }).then((r) => r.unwrap())

        let id = 0
        for await (const event of streamToGenerator(result.stream)) {
          const data = chainEventPresenter(event)

          stream.writeSSE({
            id: String(id++),
            event: event.event,
            data: typeof data === 'string' ? data : JSON.stringify(data),
          })
        }
      },
      (error: Error) => {
        captureException(error)

        return Promise.resolve()
      },
    )
  },
)
