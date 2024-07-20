import { database } from '$core/client'
import { Commit, commits, projects, workspaces } from '$core/schema'
import { eq, getTableColumns } from 'drizzle-orm'

export async function findWorkspaceFromCommit(commit: Commit, db = database) {
  const results = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(projects, eq(projects.workspaceId, workspaces.id))
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .where(eq(commits.id, commit.id))
    .limit(1)

  return results[0]
}
