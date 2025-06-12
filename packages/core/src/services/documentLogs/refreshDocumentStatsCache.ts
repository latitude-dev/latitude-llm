import { eq, getTableColumns, sql } from 'drizzle-orm'
import { cache as redis } from '../../cache'
import { database, lro } from '../../client'
import {
  DOCUMENT_STATS_CACHE_KEY,
  LIMITED_VIEW_THRESHOLD,
  STATS_CACHE_TTL,
  STATS_CACHING_THRESHOLD,
} from '../../constants'
import { Result } from '../../lib/Result'
import {
  DocumentLogsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { commits, documentLogs, documentVersions, projects } from '../../schema'
import { computeDocumentLogsAggregations } from './computeDocumentLogsAggregations'
import { computeDocumentLogsDailyCount } from './computeDocumentLogsDailyCount'

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
    const project = await db
      .select(getTableColumns(projects))
      .from(projects)
      .innerJoin(commits, eq(commits.projectId, projects.id))
      .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
      .where(eq(documentVersions.documentUuid, documentUuid))
      .limit(1)
      .then((result) => result[0])
    if (!project) {
      return Result.error(
        new Error(`Project not found for document ${documentUuid}`),
      )
    }

    const documentsRepository = new DocumentVersionsRepository(
      project.workspaceId,
      db,
    )
    const document = await documentsRepository.getSomeDocumentByUuid({
      projectId: project.id,
      documentUuid: documentUuid,
    })
    if (document.error) return Result.error(document.error)

    const logsRepository = new DocumentLogsRepository(project.workspaceId, db)
    // Approximate the number of document logs for this document
    const approximatedCount = await logsRepository.approximatedCount({
      documentUuid: documentUuid,
    })
    if (approximatedCount.error) return Result.error(approximatedCount.error)

    if (approximatedCount.value < LIMITED_VIEW_THRESHOLD) {
      // Count the number of document logs for this document
      const logs = await countByDocument(documentUuid, db)
      if (logs < STATS_CACHING_THRESHOLD) {
        return Result.ok({
          skipped: true,
          reason: 'insufficient_logs',
          logs: logs,
        })
      }
    } else {
      db = lro.database ?? db
    }

    const [aggregations, dailyCount] = await Promise.all([
      // Compute the aggregations
      (async () =>
        computeDocumentLogsAggregations(
          { projectId: project.id, documentUuid },
          db,
        ))(),
      // Compute the daily count
      (async () =>
        computeDocumentLogsDailyCount(
          { projectId: project.id, documentUuid },
          db,
        ))(),
    ])
    if (aggregations.error) return Result.error(aggregations.error)
    if (dailyCount.error) return Result.error(dailyCount.error)

    const stats = { ...aggregations.value, dailyCount: dailyCount.value }

    // Update the cache
    const cache = await redis()
    const key = DOCUMENT_STATS_CACHE_KEY(project.workspaceId, documentUuid)
    await cache.set(key, JSON.stringify(stats), 'EX', STATS_CACHE_TTL)

    return Result.ok({ success: true, logs: stats.totalCount })
  } catch (error) {
    return Result.error(error as Error)
  }
}
