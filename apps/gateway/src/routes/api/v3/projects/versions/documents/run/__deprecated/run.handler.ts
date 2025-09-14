import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter, runPresenterLegacy } from '$/presenters/runPresenter'
import { compareVersion } from '$/utils/versionComparison'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import {
  awaitClientToolResult,
  ToolHandler,
} from '@latitude-data/core/lib/streamManager/clientTools/handlers'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import {
  runDocumentAtCommitLegacy,
  type RunDocumentAtCommitLegacyArgs,
} from '@latitude-data/core/services/__deprecated/commits/runDocumentAtCommit'
import {
  runDocumentAtCommit,
  type RunDocumentAtCommitArgs,
} from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'
import { RunRoute } from '../run.route'

// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
// @ts-expect-error: streamSSE has type issues with zod-openapi
export const runHandler: AppRouteHandler<RunRoute> = async (c) => {
  const { projectId, versionUuid } = c.req.valid('param')
  const {
    path,
    parameters,
    customIdentifier,
    tools,
    stream: useSSE,
    userMessage,
    __internal,
  } = c.req.valid('json')
  const workspace = c.get('workspace')
  const { document, commit, project } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: path!,
  }).then((r) => r.unwrap())

  if (__internal?.source === LogSources.API) {
    await publishDocumentRunRequestedEvent({
      workspace,
      project,
      commit,
      document,
      parameters,
    })
  }

  const sdkVersion = c.req.header('X-Latitude-SDK-Version')
  const isLegacy = !compareVersion(sdkVersion, '5.0.0')

  const legacyArgs = {
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source: __internal?.source ?? LogSources.API,
    abortSignal: c.req.raw.signal,
  }
  const result = await _runDocumentAtCommit(
    isLegacy
      ? {
          isLegacy: true,
          data: legacyArgs,
        }
      : {
          isLegacy: false,
          data: {
            ...legacyArgs,
            context: BACKGROUND({ workspaceId: workspace.id }),
            tools: useSSE ? buildClientToolHandlersMap(tools ?? []) : {},
            userMessage,
          },
        },
  ).then((r) => r.unwrap())

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        c.req.raw.signal.addEventListener('abort', () => {
          stream.close()
        })

        try {
          for await (const event of streamToGenerator(
            result.stream,
            c.req.raw.signal,
          )) {
            const data = event.data

            stream.writeSSE({
              id: String(id++),
              event: event.event,
              data: typeof data === 'string' ? data : JSON.stringify(data),
            })
          }
        } catch (error) {
          // Handle abort errors gracefully - don't log them as actual errors
          if (isAbortError(error)) {
            // Client disconnected, close stream quietly
            return
          }

          // Re-throw other errors to be handled by the error callback
          throw error
        }
      },
      (error: Error) => {
        // Don't log abort errors as they are expected when clients disconnect
        if (isAbortError(error)) {
          return Promise.resolve()
        }

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

  let body
  if (isLegacy) {
    body = runPresenterLegacy({
      response: (await result.lastResponse)!,
      toolCalls: await result.toolCalls,
      // @ts-expect-error: trace is not in the type of new runDocumentAtCommit
      // (but it is in the legacy version)
      trace: await result.trace,
    }).unwrap()
  } else {
    body = runPresenter({
      response: (await result.lastResponse)!,
    }).unwrap()
  }

  return c.json(body)
}

export function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}

type RunDocumentArgs<T extends boolean> = T extends true
  ? { isLegacy: true; data: RunDocumentAtCommitLegacyArgs }
  : T extends false
    ? { isLegacy: false; data: RunDocumentAtCommitArgs }
    : never
async function _runDocumentAtCommit<T extends boolean>(
  args: RunDocumentArgs<T>,
) {
  const { isLegacy } = args

  if (isLegacy) {
    return runDocumentAtCommitLegacy(args.data)
  } else {
    return runDocumentAtCommit(args.data)
  }
}
