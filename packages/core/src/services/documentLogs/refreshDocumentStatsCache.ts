import { desc, eq, sql } from 'drizzle-orm'
import { cache as redis } from '../../cache'
import { database } from '../../client'
import {
  DOCUMENT_STATS_CACHE_KEY,
  LIMITED_VIEW_THRESHOLD,
  STATS_CACHE_TTL,
} from '../../constants'
import { Result } from '../../lib/Result'
import { DocumentLogsRepository } from '../../repositories'
import { commits, documentLogs, documentVersions, projects } from '../../schema'
import { computeDocumentLogsAggregations } from './computeDocumentLogsAggregations'
import { computeDocumentLogsDailyCount } from './computeDocumentLogsDailyCount'

const MIN_LOGS_FOR_CACHING = 50_000

async function countByDocument(documentUuid: string, db = database) {
  return await db
    .select({ count: sql<number>`count(*)` })
    .from(documentLogs)
    .where(eq(documentLogs.documentUuid, documentUuid))
    .then((r) => r[0]?.count ?? 0)
}

export async function refreshDocumentStatsCache(
  documentUuid: string,
  db = database,
) {
  try {
    const document = await db
      .selectDistinctOn([documentVersions.documentUuid])
      .from(documentVersions)
      .where(eq(documentVersions.documentUuid, documentUuid))
      .orderBy(desc(documentVersions.documentUuid))
      .then((result) => result[0])
    if (!document) {
      return Result.error(new Error(`Document ${documentUuid} not found`))
    }

    const workspaceId = await db
      .select({ id: projects.workspaceId })
      .from(projects)
      .innerJoin(commits, eq(commits.projectId, projects.id))
      .where(eq(commits.id, document.commitId))
      .then((result) => result[0]?.id)
    if (!workspaceId) {
      return Result.error(new Error(`Workspace ${workspaceId} not found`))
    }

    const repository = new DocumentLogsRepository(workspaceId, db)
    // Approximate the number of document logs for this document
    const approximatedCount = await repository.approximatedCount({
      documentUuid: document.documentUuid,
    })
    if (approximatedCount.error) {
      return Result.error(approximatedCount.error)
    }

    if (approximatedCount.value < LIMITED_VIEW_THRESHOLD) {
      // Count the number of document logs for this document
      const logs = await countByDocument(document.documentUuid, db)
      if (logs < MIN_LOGS_FOR_CACHING) {
        return Result.ok({
          skipped: true,
          reason: 'insufficient_logs',
          logs: logs,
        })
      }
    }

    // Compute the aggregations
    const aggregations = await computeDocumentLogsAggregations({ document }, db)
    if (aggregations.error) {
      return Result.error(aggregations.error)
    }

    // Compute the daily count
    const dailyCount = await computeDocumentLogsDailyCount({ document }, db)
    if (dailyCount.error) {
      return Result.error(dailyCount.error)
    }

    const stats = { ...aggregations.value, dailyCount: dailyCount.value }

    // Update the cache
    const cache = await redis()
    const key = DOCUMENT_STATS_CACHE_KEY(workspaceId, document.documentUuid)
    await cache.set(key, JSON.stringify(stats), 'EX', STATS_CACHE_TTL)

    return Result.ok({ success: true, logs: stats.totalCount })
  } catch (error) {
    return Result.error(error as Error)
  }
}
