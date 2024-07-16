import { database } from '$core/client'
import { HEAD_COMMIT } from '$core/constants'
import { Result, TypedResult } from '$core/lib'
import { LatitudeError, NotFoundError } from '$core/lib/errors'
import { Commit, commits } from '$core/schema'
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

export type FindCommitProps = {
  uuid: string
  projectId?: number
}
export async function findCommit(
  { projectId, uuid }: FindCommitProps,
  tx = database,
): Promise<TypedResult<Commit, LatitudeError>> {
  if (uuid === HEAD_COMMIT && projectId)
    return findHeadCommit({ projectId }, tx)

  const commit = await tx.query.commits.findFirst({
    where: eq(commits.uuid, uuid),
  })

  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  return Result.ok(commit)
}

export async function listCommits() {
  return database.select().from(commits)
}

export async function getCommitMergedAt(
  { projectId, commitUuid }: { projectId: number; commitUuid: string },
  tx = database,
): Promise<TypedResult<Date | null, LatitudeError>> {
  if (commitUuid === HEAD_COMMIT) {
    const result = await tx
      .select({ mergedAt: commits.mergedAt })
      .from(commits)
      .where(and(eq(commits.projectId, projectId), isNotNull(commits.mergedAt)))
      .orderBy(desc(commits.mergedAt))
      .limit(1)

    if (!result.length) {
      return Result.error(new NotFoundError('No head commit found'))
    }
    const headCommit = result[0]!
    return Result.ok(headCommit.mergedAt!)
  }

  const commit = await tx.query.commits.findFirst({
    where: eq(commits.uuid, commitUuid),
  })

  if (!commit) return Result.error(new NotFoundError('Commit not found'))

  return Result.ok(commit.mergedAt)
}
