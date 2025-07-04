import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { Commit, HEAD_COMMIT } from '../browser'
import { database } from '../client'
import { LatitudeError, NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'
import { commits } from '../schema'

export async function findHeadCommit(
  { projectId }: { projectId: number },
  tx = database,
): Promise<TypedResult<Commit, LatitudeError>> {
  const result = await tx
    .select()
    .from(commits)
    .where(
      and(
        isNull(commits.deletedAt),
        isNotNull(commits.mergedAt),
        eq(commits.projectId, projectId),
      ),
    )
    .orderBy(desc(commits.mergedAt))
    .limit(1)

  if (result.length < 1) {
    return Result.error(new NotFoundError('No head commit found'))
  }

  const headCommit = result[0]!
  return Result.ok(headCommit)
}

export type FindCommitByUuidProps = {
  uuid: string
  projectId?: number
}
export async function findCommitByUuid(
  { projectId, uuid }: FindCommitByUuidProps,
  tx = database,
): Promise<TypedResult<Commit, LatitudeError>> {
  if (uuid === HEAD_COMMIT) {
    if (!projectId) {
      return Result.error(new NotFoundError('Project ID is required'))
    }

    return findHeadCommit({ projectId }, tx)
  }

  const commit = await tx.query.commits.findFirst({
    where: eq(commits.uuid, uuid),
  })

  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  return Result.ok(commit)
}

export async function findCommitById(id: number, tx = database) {
  return await tx.query.commits.findFirst({
    where: eq(commits.id, id),
  })
}

export async function unsafelyFindCommitsByProjectId(
  projectId: number,
  db = database,
) {
  return db.query.commits.findMany({
    where: eq(commits.projectId, projectId),
  })
}
