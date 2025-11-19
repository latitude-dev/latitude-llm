import { Job } from 'bullmq'
import { and, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { spans } from '../../../schema/models/spans'
import { commits } from '../../../schema/models/commits'

export type MigrateSpansProjectIdJobData = {
  workspaceId: number
}

/**
 * Job that populates project_id in spans based on their commit's project_id
 * for a specific workspace.
 *
 * This job processes spans from the last week that have:
 * - project_id = NULL
 * - commit_uuid IS NOT NULL
 *
 * The job uses batch processing (1000 spans at a time) to avoid memory issues.
 */
export const migrateSpansProjectIdJob = async (
  job: Job<MigrateSpansProjectIdJobData>,
) => {
  const { workspaceId } = job.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return Result.nil()

  // Calculate cutoff date (7 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)

  await new Transaction().call(async (tx) => {
    let _totalMigratedSpans = 0
    const batchSize = 1000

    let migratedSpansBatch: number

    do {
      // Find spans that need migration
      // Select spans with NULL project_id, NOT NULL commit_uuid, from the last week
      const spansToMigrate = await tx
        .select({
          traceId: spans.traceId,
          id: spans.id,
          commitUuid: spans.commitUuid,
        })
        .from(spans)
        .where(
          and(
            eq(spans.workspaceId, workspaceId),
            isNull(spans.projectId),
            isNotNull(spans.commitUuid),
            gt(spans.startedAt, cutoffDate),
          ),
        )
        .limit(batchSize)

      if (spansToMigrate.length === 0) {
        migratedSpansBatch = 0
      } else {
        // Get unique commit UUIDs from the batch
        const uniqueCommitUuids = [
          ...new Set(
            spansToMigrate
              .map((s) => s.commitUuid)
              .filter((uuid): uuid is string => uuid !== null),
          ),
        ]

        // Fetch all commits in one query
        const commitsMap = new Map<string, number>()
        if (uniqueCommitUuids.length > 0) {
          const commitsData = await tx
            .select({
              uuid: commits.uuid,
              projectId: commits.projectId,
            })
            .from(commits)
            .where(inArray(commits.uuid, uniqueCommitUuids))

          commitsData.forEach((commit) => {
            commitsMap.set(commit.uuid, commit.projectId)
          })
        }

        // Update spans with project_id using a single SQL update with CASE statement
        // Build the update query using raw SQL for efficiency
        if (commitsMap.size > 0) {
          const updateCases: string[] = []
          const spanKeys: Array<{ traceId: string; id: string }> = []

          for (const span of spansToMigrate) {
            if (!span.commitUuid) continue
            const projectId = commitsMap.get(span.commitUuid)
            if (projectId !== undefined) {
              updateCases.push(
                `WHEN (trace_id = '${span.traceId}' AND id = '${span.id}') THEN ${projectId}`,
              )
              spanKeys.push({ traceId: span.traceId, id: span.id })
            }
          }

          if (updateCases.length > 0) {
            // Use raw SQL for a single efficient update
            await tx.execute(sql`
              UPDATE latitude.spans
              SET project_id = CASE
                ${sql.raw(updateCases.join('\n'))}
              END
              WHERE workspace_id = ${workspaceId}
                AND project_id IS NULL
                AND commit_uuid IS NOT NULL
                AND (${sql.raw(
                  spanKeys
                    .map(
                      (k) => `(trace_id = '${k.traceId}' AND id = '${k.id}')`,
                    )
                    .join(' OR '),
                )})
            `)
          }
        }

        migratedSpansBatch = spansToMigrate.length
      }

      _totalMigratedSpans += migratedSpansBatch
    } while (migratedSpansBatch === batchSize)

    return Result.nil()
  })
}
