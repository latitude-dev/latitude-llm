import { Commit } from '$core/browser'
import { database } from '$core/client'
import { HEAD_COMMIT } from '$core/constants'
import { Result, TypedResult } from '$core/lib'
import { LatitudeError, NotFoundError } from '$core/lib/errors'
import { commits } from '$core/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

export async function findHeadCommit(
  { projectId }: { projectId: number },
  tx = database,
): Promise<TypedResult<Commit, LatitudeError>> {
  const result = await tx
    .select()
    .from(commits)
    .where(and(isNotNull(commits.mergedAt), eq(commits.projectId, projectId)))
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

export async function findCommitById(
  { id }: { id: number },
  tx = database,
): Promise<TypedResult<Commit, LatitudeError>> {
  const commit = await tx.query.commits.findFirst({
    where: eq(commits.id, id),
  })

  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  return Result.ok(commit)
}

export async function listCommits() {
  return database.select().from(commits)
}
