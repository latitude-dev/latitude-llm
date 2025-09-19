import { Commit } from '../../browser'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { TypedResult, Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { mergeCommit } from './merge'
import { updateCommit } from './update'

export async function updateAndMergeCommit(
  commit: Commit,
  data: {
    title?: string
    description?: string | null
  },
  transaction = new Transaction(),
): Promise<TypedResult<Commit, Error>> {
  const assertResult = assertCommitIsDraft(commit)
  if (!Result.isOk(assertResult)) return assertResult

  if (Object.keys(data).length > 0) {
    const updateResult = await updateCommit(commit, data, transaction)
    if (!Result.isOk(updateResult)) return updateResult
    commit = updateResult.value
  }

  return mergeCommit(commit, transaction)
}
