import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/api/v3/conversations/chat/chat.route'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessages } from '@latitude-data/core/services/documentLogs/addMessages/index'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'
import { buildClientToolHandlersMap } from '../../projects/versions/documents/run'
import { addMessagesLegacy } from '@latitude-data/core/services/__deprecated/documentLogs/addMessages/index'
import { compareVersion } from '$/utils/versionComparison'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const { messages, tools, stream: useSSE, __internal } = c.req.valid('json')
  const workspace = c.get('workspace')

  const sdkVersion = c.req.header('X-Latitude-SDK-Version')

  const result = (
    await _addMessages({
      context: BACKGROUND({ workspaceId: workspace.id }),
      workspace,
      tools: buildClientToolHandlersMap(tools),
      documentLogUuid: conversationUuid,
      messages: messages as LegacyMessage[],
      source: __internal?.source ?? LogSources.API,
      abortSignal: c.req.raw.signal,
      sdkVersion,
    })
  ).unwrap()

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
        if (unknownError) captureException(error)

        return Promise.resolve()
      },
    )
  }

  const error = await result.error
  if (error) throw error

  const body = runPresenter({
    // TODO(compiler): remove this ternary
    response: (await ('response' in result
      ? result.response
      : result.lastResponse))!,
  }).unwrap()

  return c.json(body, 200)
}

async function _addMessages(args: any) {
  const { sdkVersion } = args

  if (compareVersion(sdkVersion, '5.0.0')) {
    return addMessages(args)
  } else {
    return addMessagesLegacy(args)
  }
}
