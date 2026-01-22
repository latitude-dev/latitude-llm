import { providerLogs } from '../../../schema/models/providerLogs'
import { spans } from '../../../schema/models/spans'
import { Job } from 'bullmq'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { hasPlanLimitedRetention, SubscriptionPlans } from '../../../plans'

export type CleanupWorkspaceOldLogsJobData = {
  workspaceId: number
  batchSize?: number
}

const DEFAULT_BATCH_SIZE = 1000
/**
 * Job that deletes document logs, provider logs, and spans older than the
 * plan's retention period for a specific workspace.
 *
 * This job uses optimized SQL operations to avoid loading data into memory:
 * 1. Gets the retention period from the workspace's subscription plan
 * 2. Calculates the cutoff date based on retention period
 * 3. Deletes spans in batches
 * 4. Deletes provider logs using a correlated subquery
 * 5. Uses batch processing if needed for very large datasets
 */
export const cleanupWorkspaceOldLogsJob = async (
  job: Job<CleanupWorkspaceOldLogsJobData>,
) => {
  const { workspaceId, batchSize = DEFAULT_BATCH_SIZE } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return Result.nil()

  const subscription = await findWorkspaceSubscription({ workspace }).then(
    (r) => r.value,
  )
  if (!subscription) return Result.nil()

  const workspaceHasLimitedRetention = hasPlanLimitedRetention(
    subscription.plan,
  )
  if (!workspaceHasLimitedRetention) return Result.nil()

  const planConfig = SubscriptionPlans[subscription.plan]
  const retentionDays = planConfig.retention_period

  // Calculate cutoff date based on plan's retention period
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  await new Transaction().call(async (tx) => {
    let deletedSpansBatch: number
    do {
      const spansToDelete = await tx
        .select({
          traceId: spans.traceId,
        })
        .from(spans)
        .where(
          and(
            eq(spans.workspaceId, workspaceId),
            lt(spans.startedAt, cutoffDate),
          ),
        )
        .limit(batchSize)

      if (spansToDelete.length === 0) {
        deletedSpansBatch = 0
      } else {
        const traceIds = spansToDelete.map((row) => row.traceId)

        await tx.delete(providerLogs).where(
          and(
            eq(providerLogs.workspaceId, workspaceId),
            inArray(
              providerLogs.documentLogUuid,
              tx
                .select({ documentLogUuid: spans.documentLogUuid })
                .from(spans)
                .where(
                  and(
                    eq(spans.workspaceId, workspaceId),
                    inArray(spans.traceId, traceIds),
                    isNotNull(spans.documentLogUuid),
                  ),
                ),
            ),
          ),
        )

        await tx
          .delete(spans)
          .where(
            and(
              eq(spans.workspaceId, workspaceId),
              inArray(spans.traceId, traceIds),
            ),
          )

        deletedSpansBatch = spansToDelete.length
      }
    } while (deletedSpansBatch === batchSize)

    return Result.nil()
  })
}
