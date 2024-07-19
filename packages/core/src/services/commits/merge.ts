import {
  Commit,
  commits,
  database,
  Result,
  Transaction,
} from '@latitude-data/core'
import { LatitudeError, NotFoundError } from '$core/lib/errors'
import { and, eq } from 'drizzle-orm'

export default async function mergeCommit(
  { commitId }: { commitId: number },
  db = database,
) {
  return Transaction.call<Commit>(async (tx) => {
    const mergedAt = new Date()

    const commit = await tx.query.commits.findFirst({
      where: eq(commits.id, commitId),
    })

    if (!commit) return Result.error(new NotFoundError('Commit not found'))

    // Check that there is no other commit with same mergeAt in the same project
    const otherCommits = await tx.query.commits.findMany({
      where: and(
        eq(commits.projectId, commit.projectId),
        eq(commits.mergedAt, mergedAt),
      ),
    })

    if (otherCommits.length > 0) {
      return Result.error(
        new LatitudeError('Commit merge time conflict, try again'),
      )
    }

    const result = await tx
      .update(commits)
      .set({ mergedAt })
      .where(eq(commits.id, commitId))
      .returning()
    const updatedCommit = result[0]!

    return Result.ok(updatedCommit)
  }, db)
}