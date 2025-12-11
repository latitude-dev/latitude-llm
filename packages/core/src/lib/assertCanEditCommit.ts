import { type Commit } from '../schema/models/types/Commit'
import { BadRequestError } from './errors'
import { Result, TypedResult } from './Result'
import { database, type Database } from '../client'
import { assertCommitIsDraft } from './assertCommitIsDraft'
import { assertCommitNotInActiveAbTest } from './assertCommitNotInActiveAbTest'

/**
 * Asserts that a commit can be edited by checking:
 * 1. The commit is not merged (must be a draft)
 * 2. The commit is not part of an active A/B test
 */
export async function assertCanEditCommit(
  commit: Commit,
  db: Database = database,
): Promise<TypedResult<undefined, Error>> {
  // Check if commit is merged
  const result = assertCommitIsDraft(commit)
  if (!Result.isOk(result)) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }

  const result2 = await assertCommitNotInActiveAbTest(commit, db)
  if (!Result.isOk(result2)) {
    return Result.error(
      new BadRequestError('Cannot modify a commit in an active test'),
    )
  }

  return Result.nil()
}
