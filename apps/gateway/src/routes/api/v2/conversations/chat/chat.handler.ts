import { legacyChainEventPresenter } from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { v2RunPresenter } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/api/v2/conversations/chat/chat.route'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { convertToLegacyChainStream } from '@latitude-data/core/lib/streamManager/index'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessagesLegacy } from '@latitude-data/core/services/__deprecated/documentLogs/addMessages/index'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { captureException } from '@sentry/node'
import { streamSSE } from 'hono/streaming'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const { messages, stream: useSSE, __internal } = c.req.valid('json')
  const workspace = c.get('workspace')

  const {
    stream: newStream,
    lastResponse,
    error,
    trace,
  } = (
    await addMessagesLegacy({
      context: BACKGROUND({ workspaceId: workspace.id }),
      workspace,
      documentLogUuid: conversationUuid,
      // @ts-expect-error: messages is Message[] from compiler
      messages: messages,
      source: __internal?.source ?? LogSources.API,
    })
  ).unwrap()

  const { stream: legacyStream } = convertToLegacyChainStream(newStream)

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
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
        const unknownError = getUnknownError(error)

        if (unknownError) {
          captureException(error)
        }

        return Promise.resolve()
      },
    )
  }

  const awaitedError = await error
  if (awaitedError) throw awaitedError

  const awaitedResponse = await lastResponse
  const awaitedTrace = await trace
  const body = v2RunPresenter(awaitedResponse!, awaitedTrace).unwrap()

  return c.json(body, 200)
}
