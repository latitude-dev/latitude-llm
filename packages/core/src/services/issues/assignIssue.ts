import { EvaluationResultV2, EvaluationV2 } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { Issue } from '../../schema/models/types/Issue'
import { upsertHistogram } from '../issueHistograms/upsert'
import { Commit } from '../../schema/models/types/Commit'
import { Workspace } from '../../schema/models/types/Workspace'
import { updateEvaluationResultV2 } from '../evaluationsV2/results/update'
import { IssuesRepository } from '../../repositories'
import { Project } from '../../schema/models/types/Project'
import { decrementHistogram } from '../issueHistograms/decrementHistogram'

export async function assignIssue(
  {
    workspace,
    project,
    commit,
    evaluation,
    evaluationResult,
    issue,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    evaluation: EvaluationV2
    evaluationResult: EvaluationResultV2
    issue: Issue
  },
  transaction = new Transaction(),
) {
  const documentUuid = evaluation.documentUuid

  if (documentUuid !== issue.documentUuid) {
    return Result.error(
      new Error(
        `Issue document UUID (${issue.documentUuid}) does not match the provided document version UUID (${documentUuid})`,
      ),
    )
  }

  if (evaluation.uuid !== evaluationResult.evaluationUuid) {
    return Result.error(
      new Error(
        `Evaluation UUID (${evaluation.uuid}) does not match the provided evaluation result's evaluation UUID (${evaluationResult.evaluationUuid})`,
      ),
    )
  }
  const issuesRepo = new IssuesRepository(workspace.id)
  const oldIssue = await issuesRepo.findById({
    project,
    issueId: evaluationResult.issueId,
  })

  const date = new Date()
  return transaction.call(async (_tx) => {
    const { result } = await updateEvaluationResultV2(
      {
        workspace,
        commit,
        result: evaluationResult,
        issue,
      },
      transaction,
    ).then((r) => r.unwrap())

    if (oldIssue && oldIssue.id !== issue.id) {
      // TODO: missing delete issue if histogram count reaches 0 for old issue.
      await decrementHistogram(
        { commit, issue: oldIssue, date },
        transaction,
      ).then((r) => r.unwrap())
    }

    await upsertHistogram(
      { project, commit, issue, date, documentUuid },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok({ issue, evaluationResult: result })
  })
}
