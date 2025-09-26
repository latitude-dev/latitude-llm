import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter, runPresenterLegacy } from '$/presenters/runPresenter'
import { compareVersion } from '$/utils/versionComparison'
import {
  Commit,
  DocumentVersion,
  LogSources,
  Project,
  Workspace,
} from '@latitude-data/core/browser'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import { enqueueDocumentRunJob } from '@latitude-data/core/services/documents/enqueueDocumentRunJob'
import { streamSSE } from 'hono/streaming'
import { runHandler as runHandlerLegacy } from './__deprecated/run.handler'
import { RunRoute } from './run.route'
import { captureException } from '$/common/tracer'

type RunHandlerContext = {
  c: Parameters<AppRouteHandler<RunRoute>>[0]
  workspace: Workspace
  project: Project
  commit: Commit
  document: DocumentVersion
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  userMessage?: string
  source?: LogSources
  isLegacy: boolean
}

// https://github.com/honojs/middleware/issues/735
// https://github.com/orgs/honojs/discussions/1803
// @ts-expect-error: streamSSE has type issues with zod-openapi
export const runHandler: AppRouteHandler<RunRoute> = async (c, next) => {
  const { stream, background } = c.req.valid('json')
  if (!background) return runHandlerLegacy(c, next)

  const context = await buildRunHandlerContext(c)
  if (stream) return handleStreamingMode(context)
  return await handleNonStreamingMode(context)
}

async function buildRunHandlerContext(
  c: Parameters<AppRouteHandler<RunRoute>>[0],
): Promise<RunHandlerContext> {
  const { projectId, versionUuid } = c.req.valid('param')
  const { path, parameters, customIdentifier, tools, userMessage, __internal } =
    c.req.valid('json')
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

  const source = __internal?.source ?? LogSources.API
  const sdkVersion = c.req.header('X-Latitude-SDK-Version')
  const isLegacy = !compareVersion(sdkVersion, '5.0.0')

  return {
    c,
    workspace,
    project,
    commit,
    document,
    parameters,
    customIdentifier,
    tools,
    userMessage,
    source,
    isLegacy,
  }
}

async function handleStreamingMode({
  c,
  workspace,
  project,
  commit,
  document,
  parameters,
  customIdentifier,
  tools,
  userMessage,
  source,
  isLegacy,
}: RunHandlerContext) {
  return streamSSE(
    c,
    async (stream) => {
      const abortController = new AbortController()
      stream.onAbort(() => {
        abortController.abort()
        stream.close()
      })

      try {
        let id = 0
        const { result } = await enqueueDocumentRunJob({
          workspaceId: workspace.id,
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: document.documentUuid,
          parameters,
          customIdentifier,
          tools,
          userMessage,
          source,
          isLegacy,
          abortSignal: abortController.signal,
          onEvent: ({ event, data }) => {
            stream.writeSSE({
              id: String(id++),
              event: event,
              data: typeof data === 'string' ? data : JSON.stringify(data),
            })
          },
        }).then((r) => r.unwrap())

        // Wait for stream to finish
        const error = await result.error
        if (error) throw error
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
      if (isAbortError(error)) return Promise.resolve()

      const unknownError = getUnknownError(error)
      if (unknownError) captureException(error)

      return Promise.resolve()
    },
  )
}

async function handleNonStreamingMode({
  c,
  workspace,
  project,
  commit,
  document,
  parameters,
  customIdentifier,
  userMessage,
  source,
  isLegacy,
}: RunHandlerContext) {
  const { result } = await enqueueDocumentRunJob({
    workspaceId: workspace.id,
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    parameters,
    customIdentifier,
    tools: undefined, // Note: tools are not supported for non streaming requests
    userMessage,
    source,
    isLegacy,
    abortSignal: c.req.raw.signal, // FIXME: this is not working
  }).then((r) => r.unwrap())

  // Wait for stream to finish
  const error = await result.error
  if (error) throw error

  let body
  if (isLegacy) {
    body = runPresenterLegacy({
      response: (await result.lastResponse)!,
      toolCalls: await result.toolCalls,
    }).unwrap()
  } else {
    body = runPresenter({
      response: (await result.lastResponse)!,
    }).unwrap()
  }

  return c.json(body)
}
