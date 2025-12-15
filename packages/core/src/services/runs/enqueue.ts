import { LogSources } from '@latitude-data/constants'
import { publisher } from '../../events/publisher'
import { BackgroundRunJobData } from '../../jobs/job-definitions/runs/backgroundRunJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import { createActiveRunByDocument } from './active/byDocument/create'
import { deleteActiveRunByDocument } from './active/byDocument/delete'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Experiment } from '../../schema/models/types/Experiment'
import { SimulationSettings } from '../../../../constants/src/simulation'
import { cache as redis, Cache } from '../../cache'
import { DeploymentTest } from '../../schema/models/types/DeploymentTest'

export type EnqueueRunProps = {
  activeDeploymentTest?: DeploymentTest
  cache?: Cache
  commit: Commit
  customIdentifier?: string
  datasetRowId?: number
  document: DocumentVersion
  experiment?: Experiment
  parameters?: Record<string, unknown>
  project: Project
  runUuid?: string
  simulationSettings?: SimulationSettings
  source?: LogSources
  tools?: string[]
  userMessage?: string
  workspace: Workspace
}

export async function enqueueRun({
  activeDeploymentTest,
  cache,
  commit,
  customIdentifier,
  datasetRowId,
  document,
  experiment,
  parameters,
  project,
  runUuid,
  simulationSettings,
  userMessage,
  workspace,
  source = LogSources.API,
  tools = [],
}: EnqueueRunProps) {
  runUuid = runUuid ?? generateUUIDIdentifier()
  const redisCache = cache ?? (await redis())
  const queuedAt = new Date()

  // IMPORTANT: Create the run in cache BEFORE adding to queue
  // to prevent race condition where job starts before cache entry exists
  const creating = await createActiveRunByDocument({
    workspaceId: workspace.id,
    projectId: project.id,
    documentUuid: document.documentUuid,
    commitUuid: commit.uuid,
    runUuid,
    queuedAt,
    source,
    cache: redisCache,
  })
  if (creating.error) return Result.error(creating.error)

  const run = creating.value
  const { runsQueue } = await queues()
  const job = await runsQueue.add(
    'backgroundRunJob',
    {
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: commit.uuid,
      datasetRowId,
      experimentId: experiment?.id,
      documentUuid: document.documentUuid,
      runUuid: runUuid,
      parameters: parameters,
      customIdentifier: customIdentifier,
      tools: tools,
      userMessage: userMessage,
      source: source,
      simulationSettings,
      activeDeploymentTest,
    } satisfies BackgroundRunJobData,
    {
      jobId: runUuid,
      attempts: 1,
      deduplication: { id: runUuid },
      removeOnComplete: true,
      removeOnFail: true,
      keepLogs: 0,
    },
  )
  if (!job?.id) {
    // Job creation failed - clean up cache entry
    await deleteActiveRunByDocument({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid: document.documentUuid,
      runUuid,
      cache: redisCache,
    })
    return Result.error(
      new UnprocessableEntityError('Failed to enqueue background run job'),
    )
  }

  await publisher.publishLater({
    type: 'documentRunQueued',
    data: {
      projectId: project.id,
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      run,
    },
  })

  return Result.ok({ run })
}
