import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { createRequestAbortSignal } from '$/common/createRequestAbortSignal'
import { captureException } from '$/common/tracer'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { LogSources } from '@latitude-data/constants'
import { BadRequestError, LatitudeError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runForegroundDocument } from '@latitude-data/core/services/commits/foregroundRun'
import { enqueueRun } from '@latitude-data/core/services/runs/enqueue'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import { RunRoute } from './run.route'
import { resolveAbTestRouting } from '@latitude-data/core/services/deploymentTests/resolveAbTestRouting'
import { WorkspaceDto } from '@latitude-data/core/schema/models/types/Workspace'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { DeploymentTest } from '@latitude-data/core/schema/models/types/DeploymentTest'

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
    mcpHeaders,
    stream: useSSE,
    background,
    userMessage,
    __internal,
  } = c.req.valid('json')

  if (tools.length > 0) {
    if (background) {
      throw new BadRequestError(
        'Custom tools are not supported in background runs',
      )
    }

    if (!useSSE) {
      throw new BadRequestError('You must enable Stream to use custom tools')
    }
  }

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

  const { effectiveCommit, effectiveDocument, effectiveSource, abTest } =
    await resolveAbTestRouting({
      workspaceId: workspace.id,
      projectId: project.id,
      commit,
      document,
      source,
      customIdentifier,
    })

  const shouldRunInBackground = await shouldRunInBackgroundMode({
    workspaceId: workspace.id,
    explicitBackground: background,
  })

  if (shouldRunInBackground) {
    return await handleBackgroundRun({
      c,
      workspace,
      document: effectiveDocument,
      commit: effectiveCommit,
      project,
      parameters,
      customIdentifier,
      tools,
      mcpHeaders,
      userMessage,
      source: effectiveSource,
      abTest,
    })
  }

  return await handleForegroundRun({
    c,
    workspace,
    document: effectiveDocument,
    commit: effectiveCommit,
    project,
    parameters,
    customIdentifier,
    source: effectiveSource,
    useSSE,
    tools,
    mcpHeaders,
    userMessage: userMessage || undefined,
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
  mcpHeaders,
  userMessage,
  source,
  abTest,
}: {
  c: Context
  workspace: WorkspaceDto
  document: DocumentVersion
  commit: Commit
  project: Project
  parameters: Record<string, unknown>
  customIdentifier?: string
  tools: string[]
  mcpHeaders?: Record<string, Record<string, string>>
  userMessage?: string
  source: LogSources
  abTest: DeploymentTest | null
}) {
  const { run } = await enqueueRun({
    document,
    commit,
    project,
    workspace,
    parameters,
    customIdentifier,
    tools,
    mcpHeaders,
    userMessage,
    source,
    activeDeploymentTest: abTest || undefined,
  }).then((r) => r.unwrap())

  return c.json({ uuid: run.uuid })
}

async function handleForegroundRun({
  c,
  workspace,
  document,
  commit,
  project,
  parameters,
  customIdentifier,
  source,
  useSSE,
  tools,
  mcpHeaders,
  userMessage,
}: {
  c: Context
  workspace: WorkspaceDto
  document: DocumentVersion
  commit: Commit
  project: Project
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  useSSE: boolean
  tools: string[]
  mcpHeaders?: Record<string, Record<string, string>>
  userMessage?: string
}) {
  const abortSignal = createRequestAbortSignal(c)

  const {
    stream: runStream,
    getFinalResponse,
    error,
  } = await runForegroundDocument({
    workspace,
    document,
    commit,
    parameters,
    customIdentifier,
    source,
    abortSignal,
    project,
    tools,
    mcpHeaders,
    userMessage,
  })

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

        try {
          for await (const event of streamToGenerator(runStream, abortSignal)) {
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

  const finalResponse = await getFinalResponse().catch(async (e) => {
    // Ensure pending error promises are awaited to propagate upstream
    const pendingError = await error
    if (pendingError) throw pendingError
    throw e
  })

  if (!finalResponse.response || !finalResponse.provider)
    throw new LatitudeError('Stream ended with no error and no content')

  const body = runPresenter({
    response: finalResponse.response,
    provider: finalResponse.provider,
    source: {
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    },
  }).unwrap()

  return c.json(body)
}

/**
 * Determines if a document run should execute in background mode.
 *
 * Priority:
 * 1. If explicitBackground is set, use that value
 * 2. Otherwise, check if the 'api-background-runs' feature flag is enabled for the workspace
 *
 * @param params - The background mode determination parameters
 * @param params.workspaceId - The workspace ID
 * @param params.explicitBackground - Optional explicit background flag from the request
 * @returns Whether the run should execute in background mode
 */
async function shouldRunInBackgroundMode({
  workspaceId,
  explicitBackground,
}: {
  workspaceId: number
  explicitBackground?: boolean
}): Promise<boolean> {
  if (explicitBackground !== undefined) {
    return explicitBackground
  }

  const backgroundRunsFeatureEnabled = await isFeatureEnabledByName(
    workspaceId,
    'api-background-runs',
  ).then((r) => r.unwrap())

  return backgroundRunsFeatureEnabled
}
