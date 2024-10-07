import { eq } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { Commit } from '../../browser'
import { database } from '../../client'
import { unsafelyFindCommitsByProjectId } from '../../data-access/commits'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { commits } from '../../schema'

export async function deleteCommitDraft(commit: Commit, db = database) {
  assertCommitIsDraft(commit).unwrap()

  return Transaction.call<Commit>(async (tx) => {
    try {
      const projectCommits = await unsafelyFindCommitsByProjectId(
        commit.projectId,
        tx,
      )
      if (projectCommits.length === 1) {
        return Result.error(
          new BadRequestError('Cannot delete the only version in a project'),
        )
      }

      const deleted = await tx
        .delete(commits)
        .where(eq(commits.id, commit.id))
        .returning()

      const deletedCommit = deleted[0]
      return Result.ok(deletedCommit!)
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === databaseErrorCodes.foreignKeyViolation
      ) {
        throw new BadRequestError(
          'Cannot delete this version because there are logs or evaluations associated with it.',
        )
      } else {
        throw error
      }
    }
  }, db)
}
