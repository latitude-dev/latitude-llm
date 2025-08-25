import { and, eq, getTableColumns, isNull } from 'drizzle-orm'

import { database } from '../../../client'
import { commits, projects } from '../../../schema'

export const columnSelection = getTableColumns(commits)

export function buildCommitsScope(workspaceId: number, db = database) {
  const scope = db
    .select(columnSelection)
    .from(commits)
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .where(and(isNull(commits.deletedAt), eq(projects.workspaceId, workspaceId)))
    .as('commitsScope')

  return scope
}
