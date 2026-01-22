import { Job, Queue } from 'bullmq'
import { queues } from '../../queues'
import { captureException } from '../../../utils/datadogCapture'

export type CleanOrphanedActiveJobsJobData = {
  maxAgeMs?: number
}

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Maintenance job that cleans orphaned jobs stuck in "active" state.
 * This is a safety net for jobs that weren't properly moved by stall detection.
 *
 * Jobs are considered orphaned if they've been active for longer than maxAgeMs
 * and haven't updated their progress or timestamp.
 */
export const cleanOrphanedActiveJobsJob = async (
  job: Job<CleanOrphanedActiveJobsJobData>,
) => {
  const { maxAgeMs = DEFAULT_MAX_AGE_MS } = job.data
  const allQueues = await queues()
  const now = Date.now()
  let totalCleaned = 0

  for (const [queueName, queue] of Object.entries(allQueues)) {
    try {
      const cleaned = await cleanQueueOrphanedJobs(queue, queueName, now, maxAgeMs)
      totalCleaned += cleaned
    } catch (error) {
      captureException(error as Error)
    }
  }

  if (totalCleaned > 0) {
    console.log(`[cleanOrphanedActiveJobsJob] Cleaned ${totalCleaned} orphaned jobs`)
  }
}

async function cleanQueueOrphanedJobs(
  queue: Queue,
  queueName: string,
  now: number,
  maxAgeMs: number,
): Promise<number> {
  const activeJobs = await queue.getActive()
  let cleaned = 0

  for (const job of activeJobs) {
    const jobAge = now - job.timestamp
    const processedAge = job.processedOn ? now - job.processedOn : jobAge

    if (processedAge > maxAgeMs) {
      try {
        await job.moveToFailed(
          new Error(`Job orphaned: stuck in active state for ${Math.round(processedAge / 60000)} minutes`),
          'orphan-cleanup',
          false,
        )
        console.log(`[cleanOrphanedActiveJobsJob] Moved orphaned job ${job.id} from ${queueName} to failed`)
        cleaned++
      } catch (error) {
        // Job may have been completed/moved by another process
      }
    }
  }

  return cleaned
}
