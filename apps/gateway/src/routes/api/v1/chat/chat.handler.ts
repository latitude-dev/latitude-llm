import { LogSources } from '@latitude-data/core/browser'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { streamSSE } from 'hono/streaming'

import { AppRouteHandler } from '$/openApi/types'
import { ChatRoute } from '$/routes/api/v1/chat/chat.route'
import { legacyChainEventPresenter } from '$/common/documents/getData'
import { convertToLegacyChainStream } from '@latitude-data/core/lib/chainStreamManager/index'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  return streamSSE(
    c,
    async (stream) => {
      const { conversationUuid } = c.req.valid('param')
      const { messages, __internal } = c.req.valid('json')
      const workspace = c.get('workspace')

      const { stream: newStream } = await addMessages({
        workspace,
        documentLogUuid: conversationUuid,
        // @ts-expect-error: messages types are different
        messages,
        source: __internal?.source ?? LogSources.API,
      }).then((r) => r.unwrap())

      const { stream: legacyStream } = convertToLegacyChainStream(newStream)

      let id = 0
      for await (const event of streamToGenerator(legacyStream)) {
        const data = legacyChainEventPresenter(event)

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
