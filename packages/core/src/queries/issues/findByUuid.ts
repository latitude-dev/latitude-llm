import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { issues } from '../../schema/models/issues'
import { type Issue } from '../../schema/models/types/Issue'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findIssueByUuid = scopedQuery(async function findIssueByUuid(
  {
    workspaceId,
    uuid,
  }: {
    workspaceId: number
    uuid: string
  },
  db,
): Promise<Issue> {
  const result = await db
    .select(tt)
    .from(issues)
    .where(and(tenancyFilter(workspaceId), eq(issues.uuid, uuid)))
    .limit(1)

  if (!result[0]) {
    throw new NotFoundError(`Issue with uuid ${uuid} not found`)
  }

  return result[0] as Issue
})
