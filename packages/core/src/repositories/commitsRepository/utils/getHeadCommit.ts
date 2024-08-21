import { Project } from '$core/browser'
import { database } from '$core/client'
import { InferedReturnType, NotFoundError, Result } from '$core/lib'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

import { buildCommitsScope } from './buildCommitsScope'

export async function getHeadCommitForProject(
  {
    project,
    commitsScope,
  }: {
    project: Project
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
        eq(commitsScope.projectId, project.id),
      ),
    )
    .orderBy(desc(commitsScope.mergedAt))
    .limit(1)

  if (result.length < 1) {
    return Result.error(new NotFoundError('No head commit found'))
  }

  return Result.ok(result[0]!)
}
