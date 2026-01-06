import { Job } from 'bullmq'
import { and, between, eq, inArray, isNull } from 'drizzle-orm'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'

export type BackfillEvaluationResultsTypeAndMetricJobData = {
  minId: number
  maxId: number
}

/**
 * Job that backfills evaluation results within an ID range with their type and metric.
 *
 * This job:
 * 1. Finds evaluation results with missing evaluationType within the given ID range
 * 2. Looks up the latest evaluation version for each result
 * 3. Updates the evaluation result with the type and metric
 */
export async function backfillEvaluationResultsTypeAndMetricJob(
  job: Job<BackfillEvaluationResultsTypeAndMetricJobData>,
) {
  const { minId, maxId } = job.data

  const resultsToUpdate = await database
    .select({
      id: evaluationResultsV2.id,
      evaluationUuid: evaluationResultsV2.evaluationUuid,
    })
    .from(evaluationResultsV2)
    .where(
      and(
        between(evaluationResultsV2.id, minId, maxId),
        isNull(evaluationResultsV2.type),
      ),
    )

  if (resultsToUpdate.length === 0) {
    return
  }

  const evaluationUuids = [
    ...new Set(resultsToUpdate.map((r) => r.evaluationUuid)),
  ]

  const latestVersions = await database
    .selectDistinctOn([evaluationVersions.evaluationUuid], {
      evaluationUuid: evaluationVersions.evaluationUuid,
      type: evaluationVersions.type,
      metric: evaluationVersions.metric,
    })
    .from(evaluationVersions)
    .where(inArray(evaluationVersions.evaluationUuid, evaluationUuids))
    .orderBy(evaluationVersions.evaluationUuid, evaluationVersions.id)

  const versionMap = new Map(
    latestVersions.map((v) => [
      v.evaluationUuid,
      { type: v.type, metric: v.metric },
    ]),
  )

  for (const result of resultsToUpdate) {
    const version = versionMap.get(result.evaluationUuid)
    if (!version) continue

    await database
      .update(evaluationResultsV2)
      .set({
        type: version.type,
        metric: version.metric,
      })
      .where(eq(evaluationResultsV2.id, result.id))
  }

  return
}
