import {
  commits,
  database,
  recomputeChanges,
  Result,
  Transaction,
} from '@latitude-data/core'
import { Commit } from '$core/browser'
import { LatitudeError, UnprocessableEntityError } from '$core/lib/errors'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

export async function mergeCommit(commit: Commit, db = database) {
  return Transaction.call<Commit>(async (tx) => {
    const mergedAt = new Date()
    const otherCommits = await tx
      .select()
      .from(commits)
      .where(
        and(
          eq(commits.projectId, commit.projectId),
          eq(commits.mergedAt, mergedAt),
        ),
      )
    if (otherCommits.length > 0) {
      return Result.error(
        new LatitudeError(
          'Commit publish the version time conflict, try again',
        ),
      )
    }

    const recomputedResults = await recomputeChanges(commit, tx)

    if (recomputedResults.error) return recomputedResults
    if (Object.keys(recomputedResults.value.errors).length > 0) {
      return Result.error(
        new UnprocessableEntityError(
          'There are errors in the updated documents in this version',
          {
            [commit.id]: [
              'There are errors in the updated documents in this version',
            ],
          },
        ),
      )
    }
    if (Object.keys(recomputedResults.value.changedDocuments).length === 0) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot publish a version with no changes.',
          {
            [commit.id]: ['Cannot publish a version with no changes.'],
          },
        ),
      )
    }

    const lastMergedCommit = await tx.query.commits.findFirst({
      where: and(
        isNotNull(commits.version),
        eq(commits.projectId, commit.projectId),
      ),
      orderBy: desc(commits.version),
    })
    const version = (lastMergedCommit?.version ?? 0) + 1

    const result = await tx
      .update(commits)
      .set({ mergedAt, version })
      .where(eq(commits.id, commit.id))
      .returning()
    const updatedCommit = result[0]!

    return Result.ok(updatedCommit)
  }, db)
}
