import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/v3/conversations/chat/chat.route'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/index'
import { captureException } from '@sentry/node'
import { streamSSE } from 'hono/streaming'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const { messages, stream: useSSE, __internal } = c.req.valid('json')
  const workspace = c.get('workspace')

  const result = (
    await addMessages({
      workspace,
      documentLogUuid: conversationUuid,
      // @ts-expect-error: messages types are different
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
          const data = event.data

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

  const error = await result.error
  if (error) throw error

  const response = (await result.lastResponse)!
  const toolCalls = await result.toolCalls

  const body = runPresenter({ response, toolCalls }).unwrap()
  return c.json(body, 200)
}
