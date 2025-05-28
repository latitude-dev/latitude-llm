import { count, eq, inArray } from 'drizzle-orm'
import { database } from '../../client'
import { commits, documentLogs } from '../../schema'
import { Result } from '../../lib/Result'
import { Project } from '../../browser'

export async function computeTotalRuns(project: Project, db = database) {
  try {
    const commitIds = await db
      .select({ commitId: commits.id })
      .from(commits)
      .where(eq(commits.projectId, project.id))
      .then((result) => result.map((r) => r.commitId))

    const totalRuns = await db
      .select({ count: count() })
      .from(documentLogs)
      .where(inArray(documentLogs.commitId, commitIds))
      .then((result) => result[0]?.count ?? 0)

    return Result.ok(totalRuns)
  } catch (e) {
    return Result.error(e as Error)
  }
}
