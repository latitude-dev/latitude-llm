import { and, desc, eq, isNotNull } from 'drizzle-orm'

import { InferedReturnType } from '@latitude-data/constants/commonTypes'
import { database } from '../../../client'
import { buildCommitsScope } from './buildCommitsScope'
import { type Commit } from '../../../schema/models/types/Commit'

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

  return result[0] as Commit | undefined
}
