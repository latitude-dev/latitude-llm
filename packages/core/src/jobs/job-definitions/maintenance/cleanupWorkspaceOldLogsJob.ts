import { Job } from 'bullmq'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { commits, documentLogs, projects, providerLogs } from '../../../schema'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access'
import { findWorkspaceSubscription } from '../../../services/subscriptions/data-access/find'
import { FREE_PLANS } from '../../../plans'

export type CleanupWorkspaceOldLogsJobData = {
  workspaceId: number
}

/**
 * Job that deletes document logs and associated provider logs older than 30 days
 * for a specific workspace.
 *
 * This job uses optimized SQL operations to avoid loading data into memory:
 * 1. Calculates the cutoff date (30 days ago)
 * 2. Deletes provider logs using a correlated subquery
 * 3. Deletes document logs using a correlated subquery
 * 4. Uses batch processing if needed for very large datasets
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
  if (!FREE_PLANS.includes(subscription?.plan.plan)) return Result.nil()

  // Calculate cutoff date (30 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 30)

  return await new Transaction().call(async (tx) => {
    let totalDeletedProviderLogs = 0
    let totalDeletedDocumentLogs = 0

    // Delete provider logs in batches to avoid memory issues and long-running transactions
    const batchSize = 1000

    // Delete document logs in batches
    let deletedDocumentLogsBatch: number
    let deletedProviderLogsBatch: number

    do {
      // Delete old document logs from this workspace
      // Use Drizzle query syntax: first select IDs to delete, then delete them
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

      totalDeletedDocumentLogs += deletedDocumentLogsBatch
      totalDeletedProviderLogs += deletedProviderLogsBatch
    } while (deletedDocumentLogsBatch === batchSize)

    return Result.ok({
      success: true,
      workspaceId,
      deletedDocumentLogs: totalDeletedDocumentLogs,
      deletedProviderLogs: totalDeletedProviderLogs,
      cutoffDate: cutoffDate.toISOString(),
    })
  })
}
