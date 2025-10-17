import { type Commit } from '../../schema/models/types/Commit'
import { type Workspace } from '../../schema/models/types/Workspace'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { TypedResult } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { mergeCommit } from './merge'
import { updateCommit } from './update'

export async function updateAndMergeCommit(
  {
    commit,
    workspace,
    data,
  }: {
    commit: Commit
    workspace: Workspace
    data: {
      title?: string
      description?: string | null
    }
  },
  transaction = new Transaction(),
): Promise<TypedResult<Commit, Error>> {
  const assertResult = assertCommitIsDraft(commit)
  if (assertResult.error) return assertResult

  if (Object.keys(data).length > 0) {
    const updateResult = await updateCommit(
      {
        workspace,
        commit,
        data,
      },
      transaction,
    )
    if (updateResult.error) return updateResult
    commit = updateResult.value
  }

  return mergeCommit(commit, transaction)
}
