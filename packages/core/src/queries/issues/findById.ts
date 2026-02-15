import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { issues } from '../../schema/models/issues'
import { type Issue } from '../../schema/models/types/Issue'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const findIssueById = scopedQuery(async function findIssueById(
  {
    workspaceId,
    issueId,
    project,
  }: {
    workspaceId: number
    issueId: number
    project?: Project
  },
  db,
): Promise<Issue | undefined> {
  const result = await db
    .select()
    .from(issues)
    .where(
      and(
        tenancyFilter(workspaceId),
        ...(project ? [eq(issues.projectId, project.id)] : []),
        eq(issues.id, issueId),
      ),
    )
    .limit(1)
  return result[0] as Issue | undefined
})

export const findIssue = scopedQuery(async function findIssue(
  {
    workspaceId,
    id,
  }: {
    workspaceId: number
    id: number
  },
  db,
): Promise<Issue> {
  const result = await db
    .select()
    .from(issues)
    .where(and(tenancyFilter(workspaceId), eq(issues.id, id)))
    .limit(1)

  if (!result[0]) {
    throw new NotFoundError(`Issue with id ${id} not found`)
  }

  return result[0] as Issue
})
