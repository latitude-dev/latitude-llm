import { LogSources } from '@latitude-data/constants'
import { publisher } from '../../events/publisher'
import { BackgroundRunJobData } from '../../jobs/job-definitions/runs/backgroundRunJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import { createActiveRun } from './active/create'
import { deleteActiveRun } from './active/delete'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { Experiment } from '../../schema/models/types/Experiment'
import { SimulationSettings } from '../../../../constants/src/simulation'
import { cache as redis, Cache } from '../../cache'

export async function enqueueRun({
  runUuid,
  workspace,
  project,
  commit,
  experiment,
  datasetRowId,
  document,
  parameters,
  customIdentifier,
  tools = [],
  userMessage,
  source = LogSources.API,
  simulationSettings,
  cache,
}: {
  runUuid?: string
  workspace: Workspace
  project: Project
  commit: Commit
  experiment?: Experiment
  datasetRowId?: number
  document: DocumentVersion
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  userMessage?: string
  source?: LogSources
  simulationSettings?: SimulationSettings
  cache?: Cache
}) {
  runUuid = runUuid ?? generateUUIDIdentifier()
  const redisCache = cache ?? (await redis())

  // IMPORTANT: Create the run in cache BEFORE adding to queue
  // to prevent race condition where job starts before cache entry exists
  const creating = await createActiveRun({
    workspaceId: workspace.id,
    projectId: project.id,
    runUuid,
    queuedAt: new Date(),
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
    // Job creation failed - clean up the cache entry we just created
    await deleteActiveRun({
      workspaceId: workspace.id,
      projectId: project.id,
      runUuid,
      cache: redisCache,
    })
    return Result.error(
      new UnprocessableEntityError('Failed to enqueue background run job'),
    )
  }

  await publisher.publishLater({
    type: 'runQueued',
    data: { runUuid, projectId: project.id, workspaceId: workspace.id },
  })

  return Result.ok({ run })
}
