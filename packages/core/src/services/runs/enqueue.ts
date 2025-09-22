import { LogSources } from '@latitude-data/constants'
import { Commit, DocumentVersion, Project, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { BackgroundRunJobData } from '../../jobs/job-definitions/runs/backgroundRunJob'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import { RunsRepository } from '../../repositories'

export async function enqueueRun({
  runUuid,
  document,
  commit,
  project,
  workspace,
  parameters,
  customIdentifier,
  tools = [],
  userMessage,
  source = LogSources.API,
  isLegacy,
}: {
  runUuid?: string
  document: DocumentVersion
  commit: Commit
  project: Project
  workspace: Workspace
  parameters?: Record<string, unknown>
  customIdentifier?: string
  tools?: string[]
  userMessage?: string
  source?: LogSources
  isLegacy: boolean
}) {
  runUuid = runUuid ?? generateUUIDIdentifier()

  const { runsQueue } = await queues()
  const job = await runsQueue.add(
    'backgroundRunJob',
    {
      workspaceId: workspace.id,
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      runUuid: runUuid,
      parameters: parameters,
      customIdentifier: customIdentifier,
      tools: tools,
      userMessage: userMessage,
      source: source,
      isLegacy: isLegacy,
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
    return Result.error(
      new UnprocessableEntityError('Failed to enqueue background run job'),
    )
  }

  const repository = new RunsRepository(workspace.id, project.id)
  const creating = await repository.create({ runUuid, queuedAt: new Date() })
  if (creating.error) return Result.error(creating.error)
  const run = creating.value

  await publisher.publishLater({
    type: 'runQueued',
    data: { runUuid, projectId: project.id, workspaceId: workspace.id },
  })

  return Result.ok({ run })
}
