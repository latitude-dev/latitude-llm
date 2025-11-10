import { Run } from '../../constants'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { deleteActiveRun } from './active/delete'
import { type Project } from '../../schema/models/types/Project'
import { type Workspace } from '../../schema/models/types/Workspace'
import { JOB_FINISHED_STATES, subscribeQueue } from './shared'

export async function stopRun({
  run,
  project,
  workspace,
}: {
  run: Run
  project: Project
  workspace: Workspace
}) {
  if (run.endedAt) {
    return Result.error(new UnprocessableEntityError('Run already ended'))
  }

  const { runsQueue } = await queues()
  const job = await runsQueue.getJob(run.uuid)
  if (!job?.id) {
    const result = await deleteActiveRun({
      workspaceId: workspace.id,
      projectId: project.id,
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
    publisher.publish('cancelJob', { jobId: job.id })

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
