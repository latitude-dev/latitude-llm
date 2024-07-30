import { database } from '$core/client'
import { NotFoundError, Result, TypedResult } from '$core/lib'
import { Commit, commits, projects, Workspace, workspaces } from '$core/schema'
import { eq, getTableColumns } from 'drizzle-orm'

export async function unsafelyFindWorkspace(
  id: number,
  db = database,
): Promise<TypedResult<Workspace, Error>> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, id),
  })

  if (!workspace) {
    return Result.error(new NotFoundError('Workspace not found'))
  }

  return Result.ok(workspace)
}

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
