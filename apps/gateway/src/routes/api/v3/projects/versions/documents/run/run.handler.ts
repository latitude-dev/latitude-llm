import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/tracer'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { LogSources } from '@latitude-data/core/constants'
import { BadRequestError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import {
  awaitClientToolResult,
  ToolHandler,
} from '@latitude-data/core/lib/streamManager/clientTools/handlers'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { enqueueRun } from '@latitude-data/core/services/runs/enqueue'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'
import { RunRoute } from './run.route'

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
    background,
    userMessage,
    __internal,
  } = c.req.valid('json')
  const workspace = c.get('workspace')
  const source = __internal?.source ?? LogSources.API
  const { document, commit, project } = await getData({
    workspace,
    projectId: Number(projectId!),
    commitUuid: versionUuid!,
    documentPath: path!,
  }).then((r) => r.unwrap())
  const runsEnabled = await isFeatureEnabledByName(workspace.id, 'runs').then(
    (r) => r.unwrap(),
  )

  if (source === LogSources.API) {
    await publishDocumentRunRequestedEvent({
      workspace,
      project,
      commit,
      document,
      parameters,
    })
  }

  if (background) {
    if (!runsEnabled) {
      throw new BadRequestError(
        'Background runs are not enabled for this workspace',
      )
    }

    const { run } = await enqueueRun({
      document: document,
      commit: commit,
      project: project,
      workspace: workspace,
      parameters: parameters,
      customIdentifier: customIdentifier,
      tools: tools,
      userMessage: userMessage,
      source: source,
    }).then((r) => r.unwrap())

    return c.json({ uuid: run.uuid })
  }

  const result = await runDocumentAtCommit({
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source: __internal?.source ?? LogSources.API,
    abortSignal: c.req.raw.signal, // FIXME: This does not seem to work
    context: BACKGROUND({ workspaceId: workspace.id }),
    tools: useSSE ? buildClientToolHandlersMap(tools ?? []) : {},
    userMessage,
  }).then((r) => r.unwrap())

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        // FIXME: This does not seem to work
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

  const body = runPresenter({ response: (await result.lastResponse)! }).unwrap()

  return c.json(body)
}

export function buildClientToolHandlersMap(tools: string[]) {
  return tools.reduce((acc: Record<string, ToolHandler>, toolName: string) => {
    acc[toolName] = awaitClientToolResult
    return acc
  }, {})
}
