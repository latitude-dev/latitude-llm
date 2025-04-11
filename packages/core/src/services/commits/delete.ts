import { eq } from 'drizzle-orm'
import pg from 'pg'
const { DatabaseError } = pg

import { Commit } from '../../browser'
import { database } from '../../client'
import { unsafelyFindCommitsByProjectId } from '../../data-access/commits'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { commits } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { BadRequestError } from './../../lib/errors'
import { databaseErrorCodes } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function deleteCommitDraft(commit: Commit, db = database) {
  const assertionResult = assertCommitIsDraft(commit)
  if (assertionResult.error) return assertionResult

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
        .update(commits)
        .set({ deletedAt: new Date() })
        .where(eq(commits.id, commit.id))
        .returning()

      const deletedCommit = deleted[0]!

      await pingProjectUpdate(
        {
          projectId: commit.projectId,
        },
        tx,
      ).then((r) => r.unwrap())

      return Result.ok(deletedCommit)
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
