import { count, eq } from 'drizzle-orm'
import { Project } from '../../browser'
import { database } from '../../client'
import { commits, documentLogs } from '../../schema'
import { Result } from '../../lib/Result'

export async function computeTotalRuns(project: Project, db = database) {
  try {
    const totalRuns = await db
      .select({ count: count() })
      .from(documentLogs)
      .innerJoin(commits, eq(documentLogs.commitId, commits.id))
      .where(eq(commits.projectId, project.id))
      .then((result) => result[0]?.count ?? 0)

    return Result.ok(totalRuns)
  } catch (e) {
    return Result.error(e as Error)
  }
}
