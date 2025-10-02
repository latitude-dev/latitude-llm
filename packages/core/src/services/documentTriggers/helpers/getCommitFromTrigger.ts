import { NotFoundError } from '@latitude-data/constants/errors'
import { Commit, DocumentTrigger } from '../../../schema/types'
import { Result } from '../../../lib/Result'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import { CommitsRepository } from '../../../repositories'

export async function getCommitFromTrigger(
  documentTrigger: DocumentTrigger,
  transaction = new Transaction(),
): PromisedResult<Commit> {
  return transaction.call(async (tx) => {
    const commitsScope = new CommitsRepository(documentTrigger.workspaceId, tx)
    const commitResult = await commitsScope.getCommitById(
      documentTrigger.commitId,
    )
    if (!Result.isOk(commitResult)) return commitResult
    const commit = commitResult.unwrap()

    if (!commit.mergedAt) {
      // Commit is not merged. This means that this trigger has been created/modified
      // in this same draft.
      return Result.ok(commit)
    }

    // Commit is merged. This means that the latest commit active for this trigger is Live
    const liveCommit = await commitsScope.getHeadCommit(
      documentTrigger.projectId,
    )
    if (!liveCommit) {
      return Result.error(
        new NotFoundError(
          `Live commit not found in project ${documentTrigger.projectId}`,
        ),
      )
    }

    return Result.ok(liveCommit)
  })
}
