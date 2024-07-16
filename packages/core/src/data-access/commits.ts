import { database } from '$core/client'
import { HEAD_COMMIT } from '$core/constants'
import { Result, TypedResult } from '$core/lib'
import { LatitudeError, NotFoundError } from '$core/lib/errors'
import { commits } from '$core/schema'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

export async function findHeadCommit(
  { projectId }: { projectId: number },
  tx = database,
): Promise<TypedResult<number, LatitudeError>> {
  const result = await tx
    .select({ id: commits.id })
    .from(commits)
    .where(and(isNotNull(commits.mergedAt), eq(commits.projectId, projectId)))
    .orderBy(desc(commits.mergedAt))
    .limit(1)

  console.log('searching for head commit of project', projectId)
  if (result.length < 1) {
    console.log('no head commit found')
    return Result.error(new NotFoundError('No head commit found'))
  }

  const headCommit = result[0]!
  return Result.ok(headCommit.id)
}

export async function findCommit(
  { projectId, commitUuid }: { projectId: number; commitUuid: string },
  tx = database,
): Promise<TypedResult<number, LatitudeError>> {
  if (commitUuid === HEAD_COMMIT) return findHeadCommit({ projectId }, tx)

  const res = await tx
    .select()
    .from(commits)
    .where(eq(commits.uuid, commitUuid))
    .limit(1)

  if (!res.length) return Result.error(new NotFoundError('Commit not found'))
  const commit = res[0]!
  return Result.ok(commit.id)
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

    if (!result.length)
      return Result.error(new NotFoundError('No head commit found'))
    const headCommit = result[0]!
    return Result.ok(headCommit.mergedAt!)
  }

  const result = await tx
    .select({ mergedAt: commits.mergedAt })
    .from(commits)
    .where(eq(commits.uuid, commitUuid))
    .limit(1)

  if (!result.length) return Result.error(new NotFoundError('Commit not found'))

  const commit = result[0]!
  return Result.ok(commit.mergedAt)
}
