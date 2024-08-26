import { Commit } from '$core/browser'
import { database } from '$core/client'
import { Result, Transaction } from '$core/lib'
import { assertCommitIsDraft } from '$core/lib/assertCommitIsDraft'
import { commits } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function deleteCommitDraft(commit: Commit, db = database) {
  assertCommitIsDraft(commit).unwrap()

  return Transaction.call<Commit>(async (tx) => {
    const deleted = await tx
      .delete(commits)
      .where(eq(commits.id, commit.id))
      .returning()

    const deletedCommit = deleted[0]
    return Result.ok(deletedCommit!)
  }, db)
}
