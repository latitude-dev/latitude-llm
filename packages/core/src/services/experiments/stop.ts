import { publisher } from '../../events/publisher'
import { queues } from '../../jobs/queues'
import { ProgressTracker } from '../../jobs/utils/progressTracker'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { ExperimentsRepository } from '../../repositories'
import { type Experiment } from '../../schema/models/types/Experiment'
import { notifyClientOfExperimentStatus } from '../../events/handlers/notifyClientOfExperimentStatus'
import { JOB_FINISHED_STATES } from '../runs/shared'
import { completeExperiment } from './complete'

async function cancelExperimentJobs(runUuids: string[]) {
  const { runsQueue } = await queues()

  await Promise.all(
    runUuids.map(async (runUuid) => {
      const job = await runsQueue.getJob(runUuid)
      if (!job?.id) return

      let state: string | undefined
      try {
        state = await job.getState()
      } catch {
        /* Job may have been removed, ignore */
      }

      if (state && !JOB_FINISHED_STATES.includes(state)) {
        publisher.publish('cancelJob', { jobId: job.id })
      }

      await job.remove().catch(() => {})
    }),
  )
}

/**
 * Stops an experiment by marking it as finished, canceling pending jobs,
 * and cleaning up resources.
 */
export async function stopExperiment({
  experiment,
  workspaceId,
}: {
  experiment: Experiment
  workspaceId: number
}): PromisedResult<Experiment, LatitudeError> {
  if (experiment.finishedAt) {
    return Result.ok(experiment)
  }

  const completeResult = await completeExperiment({
    experiment,
    cancelled: true,
  })
  if (completeResult.error) {
    return Result.error(completeResult.error as LatitudeError)
  }

  const updatedExperiment = completeResult.unwrap()

  const progressTracker = new ProgressTracker(experiment.uuid)
  const [, runUuids] = await Promise.all([
    progressTracker.getProgress(),
    progressTracker.getRunUuids(),
  ])

  await cancelExperimentJobs(runUuids)

  await progressTracker.cleanup()

  // Fetch the experiment DTO from the repository to ensure consistent data format
  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experimentDto = await experimentsRepository
    .findByUuid(updatedExperiment.uuid)
    .then((r) => r.unwrap())

  await notifyClientOfExperimentStatus({
    workspaceId,
    experiment: experimentDto,
  })

  return Result.ok(updatedExperiment)
}
