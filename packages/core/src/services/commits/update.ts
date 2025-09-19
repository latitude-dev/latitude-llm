import { eq } from 'drizzle-orm'

import { Commit } from '../../browser'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { BadRequestError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { commits } from '../../schema'

export async function updateCommit(
  commit: Commit,
  data: {
    title?: string
    description?: string | null
  },
  transaction = new Transaction(),
): Promise<TypedResult<Commit, Error>> {
  return transaction.call<Commit>(async (tx) => {
    const assertResult = assertCommitIsDraft(commit)
    if (!Result.isOk(assertResult)) return assertResult

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
  })
}
