import { Run } from '../../constants'
import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { RunsRepository } from '../../repositories'
import { Project, Workspace } from '../../schema/types'
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
    const runsRepo = new RunsRepository(workspace.id, project.id)
    const result = await runsRepo.delete({ runUuid: run.uuid })
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
