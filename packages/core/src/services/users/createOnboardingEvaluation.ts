import { Commit, DocumentVersion, User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { createDemoEvaluation } from '../evaluationsV2/createDemoEvaluation'

export function createOnboardingEvaluation(
  {
    workspace,
    document,
    commit,
    user,
  }: {
    workspace: Workspace
    document: DocumentVersion
    commit: Commit
    user: User
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const evaluation = await createDemoEvaluation(
      {
        user,
        document,
        commit,
        workspace,
        evaluationsV2Enabled: false,
      },
      tx,
    )

    return Result.ok(evaluation)
  }, db)
}
