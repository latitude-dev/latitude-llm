import { commits, database, Result, Transaction } from '@latitude-data/core'
import { Commit } from '$core/browser'
import { assertCommitIsDraft } from '$core/services/documents/utils'
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
