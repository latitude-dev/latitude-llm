import { commits } from '../../../schema/models/commits'
import { documentLogs } from '../../../schema/models/documentLogs'
import { projects } from '../../../schema/models/projects'
import { providerLogs } from '../../../schema/models/providerLogs'
import { spans } from '../../../schema/models/spans'
import { Job } from 'bullmq'
import { and, eq, inArray, lt } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { SubscriptionPlans } from '../../../plans'

export type CleanupWorkspaceOldLogsJobData = {
  workspaceId: number
}

/**
 * Job that deletes document logs, provider logs, and spans older than the
 * plan's retention period for a specific workspace.
 *
 * This job uses optimized SQL operations to avoid loading data into memory:
 * 1. Gets the retention period from the workspace's subscription plan
 * 2. Calculates the cutoff date based on retention period
 * 3. Deletes spans in batches
 * 4. Deletes provider logs using a correlated subquery
 * 5. Deletes document logs using a correlated subquery
 * 6. Uses batch processing if needed for very large datasets
 */
export const cleanupWorkspaceOldLogsJob = async (
  job: Job<CleanupWorkspaceOldLogsJobData>,
) => {
  const { workspaceId } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return Result.nil()

  const subscription = await findWorkspaceSubscription({ workspace }).then(
    (r) => r.value,
  )
  if (!subscription) return Result.nil()

  const planConfig = SubscriptionPlans[subscription.plan]
  const retentionDays = planConfig.retention_period

  // Skip cleanup for plans with very long retention (effectively unlimited)
  if (retentionDays >= 36500) return Result.nil()

  // Calculate cutoff date based on plan's retention period
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  await new Transaction().call(async (tx) => {
    let _totalDeletedProviderLogs = 0
    let _totalDeletedDocumentLogs = 0
    let _totalDeletedSpans = 0

    const batchSize = 1000

    // Delete spans in batches
    let deletedSpansBatch: number
    do {
      const spansToDelete = await tx
        .select({ traceId: spans.traceId, id: spans.id })
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
        const deletedSpansResult = await tx
          .delete(spans)
          .where(
            inArray(
              spans.traceId,
              spansToDelete.map((row) => row.traceId),
            ),
          )
          .returning({ traceId: spans.traceId })

        deletedSpansBatch = deletedSpansResult.length
      }

      _totalDeletedSpans += deletedSpansBatch
    } while (deletedSpansBatch === batchSize)

    // Delete document logs in batches
    let deletedDocumentLogsBatch: number
    let deletedProviderLogsBatch: number

    do {
      const idsToDelete = await tx
        .select({ id: documentLogs.id })
        .from(documentLogs)
        .innerJoin(commits, eq(commits.id, documentLogs.commitId))
        .innerJoin(projects, eq(projects.id, commits.projectId))
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            lt(documentLogs.createdAt, cutoffDate),
          ),
        )
        .limit(batchSize)

      if (idsToDelete.length === 0) {
        deletedDocumentLogsBatch = 0
        deletedProviderLogsBatch = 0
      } else {
        const deletedDocumentLogsResult = await tx
          .delete(documentLogs)
          .where(
            inArray(
              documentLogs.id,
              idsToDelete.map((row) => row.id),
            ),
          )
          .returning({
            uuid: documentLogs.uuid,
          })

        // Delete associated provider logs
        const deletedProviderLogResult = await tx
          .delete(providerLogs)
          .where(
            inArray(
              providerLogs.documentLogUuid,
              deletedDocumentLogsResult.map((d) => d.uuid),
            ),
          )
          .returning({
            id: providerLogs.id,
          })

        deletedDocumentLogsBatch = deletedDocumentLogsResult.length
        deletedProviderLogsBatch = deletedProviderLogResult.length
      }

      _totalDeletedDocumentLogs += deletedDocumentLogsBatch
      _totalDeletedProviderLogs += deletedProviderLogsBatch
    } while (deletedDocumentLogsBatch === batchSize)

    return Result.nil()
  })
}
