import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { streamSSE } from 'hono/streaming'

import { AppRouteHandler } from '$/openApi/types'
import { ChatRoute } from '$/routes/v1/chat/chat.route'
import { chainEventPresenter } from '$/common/documents/getData'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  return streamSSE(
    c,
    async (stream) => {
      const { conversationUuid } = c.req.valid('param')
      const { messages, __internal } = c.req.valid('json')
      const workspace = c.get('workspace')

      const result = await addMessages({
        workspace,
        documentLogUuid: conversationUuid,
        // @ts-expect-error: messages types are different
        messages,
        source: __internal?.source ?? LogSources.API,
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
}
