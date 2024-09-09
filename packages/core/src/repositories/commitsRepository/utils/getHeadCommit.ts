import { and, desc, eq, isNotNull } from 'drizzle-orm'

import { database } from '../../../client'
import { InferedReturnType, NotFoundError, Result } from '../../../lib'
import { buildCommitsScope } from './buildCommitsScope'

export async function getHeadCommitForProject(
  {
    projectId,
    commitsScope,
  }: {
    projectId: number
    commitsScope: InferedReturnType<typeof buildCommitsScope>
  },
  db = database,
) {
  const result = await db
    .select()
    .from(commitsScope)
    .where(
      and(
        isNotNull(commitsScope.mergedAt),
        eq(commitsScope.projectId, projectId),
      ),
    )
    .orderBy(desc(commitsScope.mergedAt))
    .limit(1)

  if (result.length < 1) {
    return Result.error(new NotFoundError('No head commit found'))
  }

  return Result.ok(result[0]!)
}
