import { eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { commits } from '../../schema'

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
