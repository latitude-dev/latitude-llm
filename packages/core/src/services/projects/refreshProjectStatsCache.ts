import { and, eq, sql } from 'drizzle-orm'

import { database } from '../../client'
import { Result } from '../../lib/Result'
import { documentLogs, commits, projects } from '../../schema'
import {
  computeProjectStats,
  MIN_LOGS_FOR_CACHING,
} from './computeProjectStats'

/**
 * Refreshes the project stats cache for a specific project
 * @param projectId The ID of the project to refresh
 * @returns Result indicating success or failure
 */
export async function refreshProjectStatsCache(projectId: number) {
  try {
    const db = database

    // Get the project
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((result) => result[0])

    if (!project) {
      return Result.error(new Error(`Project ${projectId} not found`))
    }

    // Count the number of document logs for this project
    let logCount = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(documentLogs)
      .innerJoin(
        commits,
        and(
          eq(documentLogs.commitId, commits.id),
          eq(commits.projectId, projectId),
        ),
      )
      .then((result) => result[0]?.count ?? 0)
    logCount = Number(logCount)

    // Only refresh if we have enough logs
    if (logCount < MIN_LOGS_FOR_CACHING) {
      return Result.ok({ skipped: true, reason: 'insufficient_logs', logCount })
    }

    // Compute the stats
    const stats = await computeProjectStats({ project, forceRefresh: true })
    if (stats.error) {
      return Result.error(stats.error)
    }

    return Result.ok({ success: true, logCount })
  } catch (error) {
    return Result.error(error as Error)
  }
}

/**
 * Refreshes the project stats cache for all projects in a workspace
 */
export async function refreshWorkspaceProjectStatsCache(workspaceId: number) {
  try {
    const db = database

    // Get all projects in the workspace
    const workspaceProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .then((result) => result)

    // Refresh cache for each project
    const results = await Promise.all(
      workspaceProjects.map((project) => refreshProjectStatsCache(project.id)),
    )

    // Check if any refresh failed
    const failures = results.filter((result) => result.error)

    if (failures.length > 0) {
      return Result.error(
        new Error(
          `Failed to refresh cache for ${failures.length} projects in workspace ${workspaceId}`,
        ),
      )
    }

    return Result.ok(true)
  } catch (error) {
    return Result.error(error as Error)
  }
}
