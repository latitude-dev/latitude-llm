import { eq, sql } from 'drizzle-orm'
import { database, lro } from '../../client'
import { LIMITED_VIEW_THRESHOLD, STATS_CACHING_THRESHOLD } from '../../constants'
import { Result } from '../../lib/Result'
import { DocumentLogsRepository } from '../../repositories'
import { commits, documentLogs, projects } from '../../schema'
import { computeProjectStats } from './computeProjectStats'

async function countByProject(projectId: number, db = database) {
  return await db
    .select({ count: sql`count(*)`.mapWith(Number).as('count') })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(eq(commits.projectId, projectId))
    .then((r) => r[0]?.count ?? 0)
}

export async function refreshProjectStatsCache(projectId: number, db = database) {
  try {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((result) => result[0])
    if (!project) {
      return Result.error(new Error(`Project ${projectId} not found`))
    }

    const repository = new DocumentLogsRepository(project.workspaceId, db)
    // Approximate the number of document logs for this project
    const approximatedCount = await repository.approximatedCountByProject({
      projectId: project.id,
    })
    if (approximatedCount.error) {
      return Result.error(approximatedCount.error)
    }

    if (approximatedCount.value < LIMITED_VIEW_THRESHOLD) {
      // Count the number of document logs for this project
      const logs = await countByProject(project.id, db)
      if (logs < STATS_CACHING_THRESHOLD) {
        return Result.ok({
          skipped: true,
          reason: 'insufficient_logs',
          logs: logs,
        })
      }
    } else {
      db = lro()
    }

    // Compute the stats
    const stats = await computeProjectStats(
      { workspaceId: project.workspaceId, projectId, forceRefresh: true },
      db,
    )
    if (stats.error) {
      return Result.error(stats.error)
    }

    // Note: cache has been already updated

    return Result.ok({ success: true, logs: stats.value.totalRuns })
  } catch (error) {
    return Result.error(error as Error)
  }
}
