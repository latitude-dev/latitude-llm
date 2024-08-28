import { eq, getTableColumns } from 'drizzle-orm'

import { database } from '../../../client'
import { commits, projects } from '../../../schema'

export function buildCommitsScope(workspaceId: number, db = database) {
  const scope = db
    .select(getTableColumns(commits))
    .from(commits)
    .innerJoin(projects, eq(projects.workspaceId, workspaceId))
    .where(eq(commits.projectId, projects.id))
    .as('commitsScope')
  return scope
}
