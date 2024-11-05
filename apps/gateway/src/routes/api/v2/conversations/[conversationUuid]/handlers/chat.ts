import { zValidator } from '@hono/zod-validator'
import { LogSources, messagesSchema } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { Factory } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { chainEventPresenter } from '../../../../v1/projects/[projectId]/versions/[versionUuid]/documents/handlers/_shared'
import { documentRunPresenter } from '../../../projects/[projectId]/versions/[versionUuid]/documents/handlers/documentPresenter'

const factory = new Factory()

const schema = z.object({
  messages: messagesSchema,
  stream: z.boolean().default(false),
  __internal: z
    .object({
      source: z.nativeEnum(LogSources).optional(),
    })
    .optional(),
})

export const chatHandler = factory.createHandlers(
  zValidator('json', schema),
  async (c) => {
    const { conversationUuid } = c.req.param()
    const { messages, stream: useSSE, __internal } = c.req.valid('json')
    const workspace = c.get('workspace')

    const result = (
      await addMessages({
        workspace,
        documentLogUuid: conversationUuid,
        messages,
        source: __internal?.source ?? LogSources.API,
      })
    ).unwrap()

    if (useSSE) {
      return streamSSE(
        c,
        async (stream) => {
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
          const unknownError = getUnknownError(error)

          if (unknownError) {
            captureException(error)
          }

          return Promise.resolve()
        },
      )
    }

    const response = (await result.response).unwrap()
    const body = documentRunPresenter(response).unwrap()
    return c.json(body)
  },
)
