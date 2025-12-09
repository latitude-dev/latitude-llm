import {
  getData,
  publishDocumentRunRequestedEvent,
} from '$/common/documents/getData'
import { captureException } from '$/common/tracer'
import { AppRouteHandler } from '$/openApi/types'
import { runPresenter } from '$/presenters/runPresenter'
import { LogSources } from '@latitude-data/constants'
import { BadRequestError, LatitudeError } from '@latitude-data/core/lib/errors'
import { getUnknownError } from '@latitude-data/core/lib/getUnknownError'
import { isAbortError } from '@latitude-data/core/lib/isAbortError'
import { streamToGenerator } from '@latitude-data/core/lib/streamToGenerator'
import { runForegroundDocument } from '@latitude-data/core/services/commits/foregroundRun'
import {
  enqueueRun,
  EnqueueRunProps,
} from '@latitude-data/core/services/runs/enqueue'
import { isFeatureEnabledByName } from '@latitude-data/core/services/workspaceFeatures/isFeatureEnabledByName'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'
import { RunRoute } from './run.route'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { routeRequest } from '@latitude-data/core/services/deploymentTests/routeRequest'
import { DeploymentTestsRepository } from '@latitude-data/core/repositories/deploymentTestsRepository'
import { Workspace } from '@latitude-data/core/schema/models/types/Workspace'
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

  const {
    activeDeploymentTest: activeTest,
    effectiveCommit,
    effectiveSource,
  } = await resolveDeploymentTestContext({
    workspaceId: workspace.id,
    projectId: project.id,
    commit,
    source,
    customIdentifier,
  })

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
      commit: effectiveCommit,
      project,
      parameters,
      customIdentifier,
      tools,
      userMessage,
      source: effectiveSource,
      activeDeploymentTest: activeTest || undefined,
    })
  }

  return await handleForegroundRun({
    c,
    workspace,
    document,
    commit: effectiveCommit,
    project,
    parameters,
    customIdentifier,
    source: effectiveSource,
    useSSE,
    tools,
    userMessage: userMessage || undefined,
    activeDeploymentTest: activeTest || undefined,
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
  activeDeploymentTest,
}: EnqueueRunProps & { c: Context }) {
  const { run } = await enqueueRun({
    document,
    commit,
    project,
    workspace,
    parameters,
    customIdentifier,
    tools,
    userMessage,
    source,
    activeDeploymentTest,
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
  userMessage,
  activeDeploymentTest,
}: {
  c: Context
  workspace: Workspace
  document: DocumentVersion
  commit: Commit
  project: Project
  parameters: Record<string, unknown>
  customIdentifier?: string
  source: LogSources
  useSSE: boolean
  tools: string[]
  userMessage?: string
  activeDeploymentTest?: DeploymentTest
}) {
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
    abortSignal: c.req.raw.signal, // FIXME: This does not seem to work
    project,
    tools,
    userMessage,
    activeDeploymentTest,
  })

  if (useSSE) {
    return streamSSE(
      c,
      async (stream) => {
        let id = 0

        // FIXME: This does not seem to work
        c.req.raw.signal.addEventListener(
          'abort',
          () => {
            stream.close()
          },
          { once: true },
        )

        try {
          for await (const event of streamToGenerator(
            runStream,
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

  const finalResponse = await getFinalResponse().catch(async (e) => {
    // Ensure pending error promises are awaited to propagate upstream
    const pendingError = await error
    if (pendingError) throw pendingError
    throw e
  })

  if (!finalResponse.response)
    throw new LatitudeError('Stream ended with no error and no content')

  const body = runPresenter({
    response: finalResponse.response,
    provider: finalResponse.provider,
  }).unwrap()

  return c.json(body)
}

/**
 * Resolves the deployment test context for a document run request.
 *
 * Determines the effective commit and log source based on active deployment tests.
 * For A/B tests, routes the request to either the baseline or challenger variant
 * based on the custom identifier (using consistent hashing).
 *
 * @param params - The deployment test context parameters
 * @param params.workspaceId - The workspace ID
 * @param params.projectId - The project ID
 * @param params.documentUuid - The document UUID to check for active tests
 * @param params.commit - The original commit from the request
 * @param params.source - The original log source from the request
 * @param params.customIdentifier - Optional custom identifier for A/B test routing
 * @returns Object containing the active deployment test (if any), effective commit
 *          (may differ from original for A/B tests), and effective log source
 *          (updated to reflect baseline/challenger for A/B tests)
 */
async function resolveDeploymentTestContext({
  workspaceId,
  projectId,
  commit,
  source,
  customIdentifier,
}: {
  workspaceId: number
  projectId: number
  commit: any
  source: LogSources
  customIdentifier?: string | null
}) {
  const deploymentTestsRepo = new DeploymentTestsRepository(workspaceId)
  const activeDeploymentTest = await deploymentTestsRepo.findActiveForCommit(
    projectId,
    commit.id,
  )

  if (!activeDeploymentTest || activeDeploymentTest.testType !== 'ab') {
    return {
      activeDeploymentTest,
      effectiveCommit: commit,
      effectiveSource: source,
    }
  }

  // Determine which variant to route to
  const routedTo = routeRequest(activeDeploymentTest, customIdentifier)

  // Get the head commit (baseline is always the head commit)
  const commitsRepo = new CommitsRepository(workspaceId)
  const headCommit = await commitsRepo.getHeadCommit(projectId)

  if (!headCommit) {
    // If no head commit, fall back to original commit
    return {
      activeDeploymentTest,
      effectiveCommit: commit,
      effectiveSource: source,
    }
  }

  // Determine the commit and log source based on routing
  const commitIdToUse =
    routedTo === 'baseline'
      ? headCommit.id
      : activeDeploymentTest.challengerCommitId

  const effectiveSource =
    routedTo === 'baseline' ? source : LogSources.ABTestChallenger

  if (commitIdToUse === commit.id) {
    return { activeDeploymentTest, effectiveCommit: commit, effectiveSource }
  }

  const effectiveCommit = await commitsRepo
    .getCommitById(commitIdToUse)
    .then((r) => r.unwrap())

  return { activeDeploymentTest, effectiveCommit, effectiveSource }
}
