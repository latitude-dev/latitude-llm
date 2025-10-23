import { EvaluationResultV2 } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { updateEvaluationResultV2 } from '../evaluationsV2/results/update'
import { IssuesRepository } from '../../repositories'
import { Project } from '../../schema/models/types/Project'
import { decrementHistogram } from '../issueHistograms/decrementHistogram'

export async function unAssignIssue(
  {
    workspace,
    project,
    commit,
    evaluationResult,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    evaluationResult: EvaluationResultV2
  },
  transaction = new Transaction(),
) {
  const issuesRepo = new IssuesRepository(workspace.id)
  const assignedIssue = await issuesRepo.findById({
    project,
    issueId: evaluationResult.issueId,
  })

  if (!assignedIssue) return Result.ok(evaluationResult)

  const date = new Date()
  return transaction.call(async (_tx) => {
    const { result } = await updateEvaluationResultV2(
      {
        workspace,
        commit,
        result: evaluationResult,
        issue: null,
      },
      transaction,
    ).then((r) => r.unwrap())

    // TODO: missing delete issue if histogram count reaches 0 for old issue.
    await decrementHistogram(
      { commit, issue: assignedIssue, date },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok(result)
  })
}
