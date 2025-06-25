import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/api/v3/conversations/chat/chat.route'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/addMessages/index'
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
      messages: messages as LegacyMessage[],
      source: __internal?.source ?? LogSources.API,
      abortSignal: c.req.raw.signal,
    })
  ).unwrap()

  console.log(result)

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0
        // Add explicit connection close handling
        c.req.raw.signal.addEventListener(
          'abort',
          () => {
            stream.close()
          },
          { once: true },
        )

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

  const response = (await result.response)!
  const toolCalls = await result.toolCalls

  const body = runPresenter({ response, toolCalls }).unwrap()
  return c.json(body, 200)
}
