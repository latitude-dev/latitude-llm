import { eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError } from '../../lib/errors'
import { commits } from '../../schema'
import { Result } from './../../lib/Result'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function updateCommit(
  commit: Commit,
  data: {
    title?: string
    description?: string | null
  },
  db = database,
): Promise<TypedResult<Commit, Error>> {
  return Transaction.call<Commit>(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    if (assertResult.error) return assertResult

    if (Object.keys(data).length === 0) {
      return Result.error(
        new BadRequestError('No updates provided for the commit'),
      )
    }

    const result = await tx
      .update(commits)
      .set(data)
      .where(eq(commits.id, commit.id))
      .returning()

    const updatedCommit = result[0]
    return Result.ok(updatedCommit!)
  }, db)
}
