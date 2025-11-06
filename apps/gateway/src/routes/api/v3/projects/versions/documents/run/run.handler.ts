import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/tracer'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { LogSources } from '@latitude-data/core/constants'
import { LatitudeError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import { buildClientToolHandlersMap } from '@latitude-data/core/services/documents/tools/clientTools/handlers'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { enqueueRun } from '@latitude-data/core/services/runs/enqueue'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { BACKGROUND } from '@latitude-data/core/telemetry'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import { RunRoute } from './run.route'
import { ProviderApiKeysRepository } from '@latitude-data/core/repositories'

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

  if (source === LogSources.API) {
    await publishDocumentRunRequestedEvent({
      workspace,
      project,
      commit,
      document,
      parameters,
    })
  }

  // Check if background execution should happen:
  // 1. If background prop is explicitly set, use that value
  // 2. Otherwise, check if the feature flag is enabled for the workspace
  const backgroundRunsFeatureEnabled = await isFeatureEnabledByName(
    workspace.id,
    'api-background-runs',
  ).then((r) => r.unwrap())

  const shouldRunInBackground =
    background !== undefined ? background : backgroundRunsFeatureEnabled

  if (shouldRunInBackground) {
    return await handleBackgroundRun({
      c,
      workspace,
      document,
      commit,
      project,
      parameters,
      customIdentifier,
      tools,
      userMessage,
      source,
    })
  }

  return await handleForegroundRun({
    c,
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source: __internal?.source ?? LogSources.API,
    useSSE,
    tools,
    userMessage,
  })
}

async function handleBackgroundRun({
  c,
  workspace,
  document,
  commit,
  project,
  parameters,
  customIdentifier,
  tools,
  userMessage,
  source,
}: {
  c: Context
  workspace: any
  document: any
  commit: any
  project: any
  parameters: any
  customIdentifier: any
  tools: any
  userMessage: any
  source: any
}) {
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

async function handleForegroundRun({
  c,
  workspace,
  document,
  commit,
  parameters,
  customIdentifier,
  source,
  useSSE,
  tools,
  userMessage,
}: {
  c: Context
  workspace: any
  document: any
  commit: any
  parameters: any
  customIdentifier: any
  source: any
  useSSE: boolean
  tools: any
  userMessage: any
}) {
  const result = await runDocumentAtCommit({
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source,
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

  const response = await result.lastResponse
  if (!response)
    throw new LatitudeError('Stream ended with no error and no content')

  const providerScope = new ProviderApiKeysRepository(workspace.id)
  const providerUsed = await providerScope
    .find(response.providerLog?.providerId)
    .then((r) => r.unwrap())

  const body = runPresenter({
    response,
    provider: providerUsed,
  }).unwrap()

  return c.json(body)
}
