import { commits } from '../schema/models/commits'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'

import { type Commit } from '../schema/models/types/Commit'
import { HEAD_COMMIT } from '../constants'
import { database } from '../client'
import { LatitudeError, NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'

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

  const commit = await tx
    .select()
    .from(commits)
    .where(eq(commits.uuid, uuid))
    .limit(1)
    .then((rows) => rows[0])

  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  return Result.ok(commit)
}

export async function findCommitById(id: number, tx = database) {
  return await tx
    .select()
    .from(commits)
    .where(eq(commits.id, id))
    .limit(1)
    .then((rows) => rows[0])
}

export async function unsafelyFindCommitsByProjectId(
  projectId: number,
  db = database,
) {
  return db.select().from(commits).where(eq(commits.projectId, projectId))
}
