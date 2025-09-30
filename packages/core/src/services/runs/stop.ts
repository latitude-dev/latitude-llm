import { Project, Run, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { NotFoundError, UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { JOB_FINISHED_STATES, subscribeQueue } from './shared'

export async function stopRun({
  run,
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
    return Result.error(
      new NotFoundError(`Active run job with uuid ${run.uuid} not found`),
    )
  }

  const state = await job.getState()
  if (!JOB_FINISHED_STATES.includes(state)) {
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
