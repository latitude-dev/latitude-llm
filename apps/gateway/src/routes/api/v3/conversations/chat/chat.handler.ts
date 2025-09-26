import { captureException } from '$/common/tracer'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter, runPresenterLegacy } from '$/presenters/runPresenter'
import { ChatRoute } from '$/routes/api/v3/conversations/chat/chat.route'
import { compareVersion } from '$/utils/versionComparison'
import { Message as LegacyMessage } from '@latitude-data/constants/legacyCompiler'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import {
  awaitClientToolResult,
  ToolHandler,
} from '@latitude-data/core/lib/streamManager/clientTools/handlers'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { addMessagesLegacy } from '@latitude-data/core/services/__deprecated/documentLogs/addMessages/index'
import { addMessages } from '@latitude-data/core/services/documentLogs/addMessages/index'
import { BACKGROUND, telemetry } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'

// @ts-expect-error: streamSSE has type issues
export const chatHandler: AppRouteHandler<ChatRoute> = async (c) => {
  const { conversationUuid } = c.req.valid('param')
  const {
    messages,
    tools,
    stream: useSSE,
    trace,
    __internal,
  } = c.req.valid('json')
  const workspace = c.get('workspace')

  const sdkVersion = c.req.header('X-Latitude-SDK-Version')
  const isLegacy = !compareVersion(sdkVersion, '5.0.0')

  const result = (
    await _addMessages({
      context: trace
        ? telemetry.resume(trace)
        : BACKGROUND({ workspaceId: workspace.id }),
      workspace,
      tools: buildClientToolHandlersMap(tools),
      documentLogUuid: conversationUuid,
      messages: messages as LegacyMessage[],
      source: __internal?.source ?? LogSources.API,
      abortSignal: c.req.raw.signal,
      isLegacy,
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

  let body
  if (isLegacy) {
    body = runPresenterLegacy({
      // @ts-expect-error: expected since result can be legacy or not
      response: await result.lastResponse,
      toolCalls: await result.toolCalls,
      // @ts-expect-error: expected since only legacy result has trace
      trace: await result.trace,
    }).unwrap()
  } else {
    body = runPresenter({
      // @ts-expect-error: expected since result can be legacy or not
      response: await result.response,
    }).unwrap()
  }

  return c.json(body, 200)
}

function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}

async function _addMessages(args: any) {
  const { isLegacy } = args

  if (isLegacy) {
    return addMessagesLegacy(args)
  } else {
    return addMessages(args)
  }
}
