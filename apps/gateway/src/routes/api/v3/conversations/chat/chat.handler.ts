import { captureException } from '$/common/tracer'
import { createRequestAbortSignal } from '$/common/createRequestAbortSignal'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/api/v3/conversations/chat/chat.route'
import { Message } from '@latitude-data/constants/messages'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { buildClientToolHandlersMap } from '@latitude-data/core/services/documents/tools/clientTools/handlers'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/addMessages/index'
import { streamSSE } from 'hono/streaming'
import { LogSources } from '@latitude-data/core/constants'
import { BadRequestError } from '@latitude-data/constants/errors'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const {
    messages,
    tools,
    mcpHeaders,
    stream: useSSE,
    __internal,
  } = c.req.valid('json')
  const workspace = c.get('workspace')
  if (tools.length > 0 && !useSSE) {
    throw new BadRequestError('You must enable Stream to use custom tools')
  }

  const abortSignal = createRequestAbortSignal(c)

  const result = (
    await addMessages({
      workspace,
      tools: buildClientToolHandlersMap(tools),
      mcpHeaders,
      documentLogUuid: conversationUuid,
      messages: messages as Message[],
      source: __internal?.source ?? LogSources.API,
      abortSignal,
    })
  ).unwrap()

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        abortSignal.addEventListener(
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
        if (unknownError) captureException(error)

        return Promise.resolve()
      },
    )
  }

  const error = await result.error
  if (error) throw error

  const response = (await result.response)!

  const body = runPresenter({
    response,
    source: undefined,
  }).unwrap()

  return c.json(body, 200)
}
