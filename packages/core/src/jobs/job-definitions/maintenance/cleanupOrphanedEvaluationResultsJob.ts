import { Job } from 'bullmq'
import { inArray, isNull, or } from 'drizzle-orm'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'

export type CleanupOrphanedEvaluationResultsJobData = Record<string, never>

/**
 * Job that deletes evaluation results that don't have a type or metric attached.
 *
 * This job uses batch processing to avoid locking the table for too long:
 * 1. Selects IDs in batches of 1000
 * 2. Deletes the selected IDs
 * 3. Repeats until no more orphaned records are found
 */
export async function cleanupOrphanedEvaluationResultsJob(
  _: Job<CleanupOrphanedEvaluationResultsJobData>,
) {
  const batchSize = 1000
  let totalDeleted = 0
  let deletedBatch: number

  do {
    const idsToDelete = await database
      .select({ id: evaluationResultsV2.id })
      .from(evaluationResultsV2)
      .where(
        or(
          isNull(evaluationResultsV2.type),
          isNull(evaluationResultsV2.metric),
        ),
      )
      .limit(batchSize)

    if (idsToDelete.length === 0) {
      deletedBatch = 0
    } else {
      const deleted = await database
        .delete(evaluationResultsV2)
        .where(
          inArray(
            evaluationResultsV2.id,
            idsToDelete.map((r) => r.id),
          ),
        )
        .returning({ id: evaluationResultsV2.id })

      deletedBatch = deleted.length
      totalDeleted += deletedBatch
    }
  } while (deletedBatch === batchSize)

  return {
    message: `Successfully deleted ${totalDeleted} orphaned evaluation results`,
    deletedCount: totalDeleted,
  }
}
