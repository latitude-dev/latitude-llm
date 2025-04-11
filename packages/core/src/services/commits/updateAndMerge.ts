import { Commit } from '../../browser'
import { database } from '../../client'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { mergeCommit } from './merge'
import { updateCommit } from './update'
import { TypedResult } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function updateAndMergeCommit(
  commit: Commit,
  data: {
    title?: string
    description?: string | null
  },
  db = database,
): Promise<TypedResult<Commit, Error>> {
  const assertResult = assertCommitIsDraft(commit)
  if (assertResult.error) return assertResult

  return Transaction.call<Commit>(async (tx) => {
    if (Object.keys(data).length > 0) {
      const updateResult = await updateCommit(commit, data, tx)
      if (updateResult.error) return updateResult
      commit = updateResult.value
    }

    return mergeCommit(commit, tx)
  }, db)
}
