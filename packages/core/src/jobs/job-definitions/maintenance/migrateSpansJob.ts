import { Job } from 'bullmq'
import { and, asc, eq, gt, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { commits } from '../../../schema/models/commits'
import { documentLogs } from '../../../schema/models/documentLogs'
import { experiments } from '../../../schema/models/experiments'
import { spans } from '../../../schema/models/spans'
import Transaction from '../../../lib/Transaction'
import { Result } from '../../../lib/Result'
import { SpanType } from '@latitude-data/constants'

type MigrateSpansJobData = {
  workspaceId: number
}

export const migrateSpansJob = async (job: Job<MigrateSpansJobData>) => {
  const { workspaceId } = job.data

  // Calculate cutoff date (30 days ago)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 30)

  // Cache to avoid redundant lookups across batches
  const commitCache = new Map<number, string>()
  const experimentCache = new Map<number, string>()

  return await new Transaction().call(async (tx) => {
    const batchSize = 1000
    let cursor: { startedAt: Date; id: string } | null = null
    let processedSpans = 0

    while (true) {
      // Query spans that need migration: have documentLogUuid but missing documentUuid/commitUuid/experimentId
      // Only process spans of type 'prompt'
      // Use cursor-based pagination for efficiency
      let whereClause = and(
        eq(spans.workspaceId, workspaceId),
        eq(spans.type, SpanType.Prompt),
        gt(spans.startedAt, cutoffDate),
        isNotNull(spans.documentLogUuid),
        isNull(spans.documentUuid),
        isNull(spans.commitUuid),
        isNull(spans.experimentUuid),
      )

      if (cursor) {
        whereClause = and(
          whereClause,
          or(
            gt(spans.startedAt, cursor.startedAt),
            and(eq(spans.startedAt, cursor.startedAt), gt(spans.id, cursor.id)),
          ),
        )
      }

      const spansToMigrate = await tx
        .select({
          id: spans.id,
          traceId: spans.traceId,
          documentLogUuid: spans.documentLogUuid,
          startedAt: spans.startedAt,
        })
        .from(spans)
        .where(whereClause)
        .orderBy(asc(spans.startedAt), asc(spans.id))
        .limit(batchSize)

      if (spansToMigrate.length === 0) break

      // Update cursor for next batch
      const lastSpan = spansToMigrate[spansToMigrate.length - 1]
      cursor = { startedAt: lastSpan.startedAt, id: lastSpan.id }

      // Collect unique document log UUIDs
      const documentLogUuids = spansToMigrate.map((s) => s.documentLogUuid!)
      const uniqueDocumentLogUuids = [...new Set(documentLogUuids)]

      // Fetch document logs data
      const documentLogsData = await tx
        .select({
          uuid: documentLogs.uuid,
          documentUuid: documentLogs.documentUuid,
          commitId: documentLogs.commitId,
          experimentId: documentLogs.experimentId,
        })
        .from(documentLogs)
        .where(inArray(documentLogs.uuid, uniqueDocumentLogUuids))

      // Create maps for quick lookup
      const documentLogMap = new Map(
        documentLogsData.map((dl) => [dl.uuid, dl]),
      )

      // Collect unique commit IDs that need UUID lookup
      const commitIds = documentLogsData
        .map((dl) => dl.commitId)
        .filter((id): id is number => id !== null && !commitCache.has(id))

      // Fetch commit UUIDs for uncached commits
      if (commitIds.length > 0) {
        const commitsData = await tx
          .select({
            id: commits.id,
            uuid: commits.uuid,
          })
          .from(commits)
          .where(inArray(commits.id, commitIds))

        commitsData.forEach((c) => commitCache.set(c.id, c.uuid))
      }

      // Collect unique experiment IDs that need UUID lookup
      const experimentIds = documentLogsData
        .map((dl) => dl.experimentId)
        .filter((id): id is number => id !== null && !experimentCache.has(id))

      // Fetch experiment UUIDs for uncached experiments
      if (experimentIds.length > 0) {
        const experimentsData = await tx
          .select({
            id: experiments.id,
            uuid: experiments.uuid,
          })
          .from(experiments)
          .where(inArray(experiments.id, experimentIds))

        experimentsData.forEach((e) => experimentCache.set(e.id, e.uuid))
      }

      // Prepare bulk update data
      const updateData = spansToMigrate
        .map((span) => {
          const docLog = documentLogMap.get(span.documentLogUuid!)
          if (!docLog) return null

          const commitUuid = docLog.commitId
            ? commitCache.get(docLog.commitId) || null
            : null
          const experimentUuid = docLog.experimentId
            ? experimentCache.get(docLog.experimentId) || null
            : null

          return {
            id: span.id,
            traceId: span.traceId,
            documentUuid: docLog.documentUuid,
            commitUuid,
            experimentUuid,
          }
        })
        .filter(
          (update): update is NonNullable<typeof update> => update !== null,
        )

      if (updateData.length > 0) {
        // Update spans individually since we need to set specific values
        for (const update of updateData) {
          await tx
            .update(spans)
            .set({
              documentUuid: update.documentUuid,
              commitUuid: update.commitUuid,
              experimentUuid: update.experimentUuid,
            })
            .where(
              and(eq(spans.traceId, update.traceId), eq(spans.id, update.id)),
            )
            .execute()
        }
      }

      processedSpans += spansToMigrate.length

      // If we got less than batch size, we've processed all spans
      if (spansToMigrate.length < batchSize) break
    }

    return Result.ok({ processedSpans })
  })
}
