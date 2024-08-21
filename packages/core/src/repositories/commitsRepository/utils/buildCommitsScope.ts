import { database } from '$core/client'
import { commits, projects } from '$core/schema'
import { eq, getTableColumns } from 'drizzle-orm'

export function buildCommitsScope(workspaceId: number, db = database) {
  const scope = db
    .select(getTableColumns(commits))
    .from(commits)
    .innerJoin(projects, eq(projects.workspaceId, workspaceId))
    .where(eq(commits.projectId, projects.id))
    .as('commitsScope')
  return scope
}
