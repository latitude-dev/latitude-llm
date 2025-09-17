import { Job } from 'bullmq'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { commits, documentLogs, projects, providerLogs } from '../../../schema'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'

export type MigrateWorkspaceLogsJobData = {
  workspaceId: number
}

/**
 * Job that backfills workspaceId on document_logs and provider_logs in batches
 * for a specific workspace, to support row-level security patterns.
 *
 * This job:
 * 1. Updates document_logs.workspace_id for rows where null by joining commits and projects
 * 2. Updates provider_logs.workspace_id for rows where null by joining document_logs
 * 3. Processes records in batches using a cursor to avoid large transactions
 */
export const migrateWorkspaceLogsJob = async (
  job: Job<MigrateWorkspaceLogsJobData>,
) => {
  const { workspaceId } = job.data

  const batchSize = 1000
  let lastDocId = 0
  let migratedDocs = 0

  // Backfill document_logs.workspace_id
  let hasMoreDocs = true
  while (hasMoreDocs) {
    await new Transaction().call(async (tx) => {
      const rows = await tx
        .select({ id: documentLogs.id })
        .from(documentLogs)
        .innerJoin(commits, eq(commits.id, documentLogs.commitId))
        .innerJoin(
          projects,
          and(
            eq(projects.id, commits.projectId),
            eq(projects.workspaceId, workspaceId),
          ),
        )
        .where(
          and(isNull(documentLogs.workspaceId), gt(documentLogs.id, lastDocId)),
        )
        .orderBy(asc(documentLogs.id))
        .limit(batchSize)

      if (rows.length === 0) {
        hasMoreDocs = false
        return Result.ok(null)
      }

      lastDocId = rows[rows.length - 1]!.id
      const ids = rows.map((r) => r.id)

      await tx
        .update(documentLogs)
        .set({ workspaceId })
        .where(inArray(documentLogs.id, ids))

      migratedDocs += rows.length

      return Result.ok(null)
    })
  }

  // Backfill provider_logs.workspace_id
  let lastProvId = 0
  let migratedProvs = 0
  let hasMoreProvs = true
  while (hasMoreProvs) {
    await new Transaction().call(async (tx) => {
      const rows = await tx
        .select({ id: providerLogs.id })
        .from(providerLogs)
        .innerJoin(
          documentLogs,
          eq(providerLogs.documentLogUuid, documentLogs.uuid),
        )
        .where(
          and(
            eq(documentLogs.workspaceId, workspaceId),
            isNull(providerLogs.workspaceId),
            gt(providerLogs.id, lastProvId),
          ),
        )
        .orderBy(asc(providerLogs.id))
        .limit(batchSize)

      if (rows.length === 0) {
        hasMoreProvs = false
        return Result.ok(null)
      }

      lastProvId = rows[rows.length - 1]!.id
      const ids = rows.map((r) => r.id)

      await tx
        .update(providerLogs)
        .set({ workspaceId })
        .where(inArray(providerLogs.id, ids))

      migratedProvs += rows.length

      return Result.ok(null)
    })
  }

  return Result.ok({ workspaceId, migratedDocs, migratedProvs })
}
