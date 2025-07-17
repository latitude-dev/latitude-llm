import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/sentry'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter, runPresenterLegacy } from '$/presenters/runPresenter'
import { LogSources } from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'
import { RunRoute } from './run.route'
import {
  awaitClientToolResult,
  ToolHandler,
} from '@latitude-data/core/lib/streamManager/clientTools/handlers'
import { runDocumentAtCommitLegacy } from '@latitude-data/core/services/__deprecated/commits/runDocumentAtCommit'
import { compareVersion } from '$/utils/versionComparison'

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

  const result = await _runDocumentAtCommit({
    context: BACKGROUND({ workspaceId: workspace.id }),
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    tools: useSSE ? buildClientToolHandlersMap(tools) : {},
    source: __internal?.source ?? LogSources.API,
    abortSignal: c.req.raw.signal,
    isLegacy,
  }).then((r) => r.unwrap())

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        c.req.raw.signal.addEventListener('abort', () => {
          stream.close()
        })

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

async function _runDocumentAtCommit(args: any) {
  const { isLegacy } = args

  if (isLegacy) {
    return runDocumentAtCommitLegacy(args)
  } else {
    return runDocumentAtCommit(args)
  }
}
