import { Job } from 'bullmq'
import { sql } from 'drizzle-orm'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { queues } from '../../queues'

export type ScheduleBackfillEvaluationResultsTypeAndMetricJobsData = Record<
  string,
  never
>

const BATCH_RANGE_SIZE = 10_000

/**
 * Scheduler job that enqueues batch jobs to backfill evaluation results
 * with their type and metric.
 *
 * This job:
 * 1. Gets the MIN and MAX id from evaluation_results_v2
 * 2. Divides the ID range into chunks of BATCH_RANGE_SIZE
 * 3. Enqueues a backfillEvaluationResultsTypeAndMetricJob for each chunk
 */
export async function scheduleBackfillEvaluationResultsTypeAndMetricJobs(
  _: Job<ScheduleBackfillEvaluationResultsTypeAndMetricJobsData>,
) {
  const result = await database
    .select({
      minId: sql<number>`MIN(${evaluationResultsV2.id})::integer`,
      maxId: sql<number>`MAX(${evaluationResultsV2.id})::integer`,
    })
    .from(evaluationResultsV2)
    .then((r) => r[0])

  if (!result?.minId || !result?.maxId) {
    return {
      message: 'No evaluation results found to backfill',
      enqueuedJobs: 0,
    }
  }

  const { minId, maxId } = result
  const { maintenanceQueue } = await queues()
  let enqueuedJobs = 0

  for (
    let rangeStart = minId;
    rangeStart <= maxId;
    rangeStart += BATCH_RANGE_SIZE
  ) {
    const rangeEnd = Math.min(rangeStart + BATCH_RANGE_SIZE - 1, maxId)

    await maintenanceQueue.add(
      'backfillEvaluationResultsTypeAndMetricJob',
      { minId: rangeStart, maxId: rangeEnd },
      { attempts: 3 },
    )

    enqueuedJobs++
  }

  return {
    message: `Successfully scheduled ${enqueuedJobs} backfill jobs for ID range ${minId}-${maxId}`,
    enqueuedJobs,
    minId,
    maxId,
  }
}
