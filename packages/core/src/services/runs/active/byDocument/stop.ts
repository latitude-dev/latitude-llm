import { Run } from '@latitude-data/constants'
import { queues } from '../../../../jobs/queues'
import { UnprocessableEntityError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { setCancelJobFlag } from '../../../../lib/cancelJobs'
import { deleteActiveRunByDocument } from './delete'
import { type Project } from '../../../../schema/models/types/Project'
import { type Workspace } from '../../../../schema/models/types/Workspace'
import { JOB_FINISHED_STATES, subscribeQueue } from '../../shared'

/**
 * Stops a run by canceling its job and removing it from document-scoped cache.
 * This is the document-scoped version of stopRun.
 */
export async function stopRunByDocument({
  run,
  project,
  workspace,
  documentUuid,
}: {
  run: Run
  project: Project
  workspace: Workspace
  documentUuid: string
}) {
  if (run.endedAt) {
    return Result.error(new UnprocessableEntityError('Run already ended'))
  }

  const { runsQueue } = await queues()
  const job = await runsQueue.getJob(run.uuid)
  if (!job?.id) {
    const result = await deleteActiveRunByDocument({
      workspaceId: workspace.id,
      projectId: project.id,
      documentUuid,
      runUuid: run.uuid,
    })
    if (!Result.isOk(result)) return result

    return Result.nil()
  }

  let state: string | undefined
  try {
    state = await job.getState()
  } catch {
    /* No-op */
  }

  if (state && !JOB_FINISHED_STATES.includes(state)) {
    await setCancelJobFlag(job.id)

    try {
      const subscription = await subscribeQueue()
      await job.waitUntilFinished(subscription, 10 * 1000)
    } catch {
      /* No-op */
    }
  }

  try {
    await job.remove()
  } catch {
    /* No-op */
  }

  return Result.nil()
}
