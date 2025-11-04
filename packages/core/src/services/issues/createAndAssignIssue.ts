import { EvaluationResultV2, EvaluationV2 } from '@latitude-data/constants'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { upsertHistogram } from '../issueHistograms/upsert'
import { Commit } from '../../schema/models/types/Commit'
import { Project } from '../../schema/models/types/Project'
import { Workspace } from '../../schema/models/types/Workspace'
import { updateEvaluationResultV2 } from '../evaluationsV2/results/update'
import { createIssue } from './create'

export async function createAndAssignIssue(
  {
    workspace,
    project,
    commit,
    evaluation,
    evaluationResult,
    title,
    description,
  }: {
    workspace: Workspace
    project: Project
    commit: Commit
    evaluation: EvaluationV2
    evaluationResult: EvaluationResultV2
    title: string
    description: string
  },
  transaction = new Transaction(),
) {
  if (evaluation.uuid !== evaluationResult.evaluationUuid) {
    return Result.error(
      new Error(
        `Evaluation UUID (${evaluation.uuid}) does not match the provided evaluation result's evaluation UUID (${evaluationResult.evaluationUuid})`,
      ),
    )
  }

  return transaction.call(async (_tx) => {
    const issue = await createIssue(
      {
        workspace,
        project,
        documentUuid: evaluation.documentUuid,
        title,
        description,
      },
      transaction,
    ).then((r) => r.unwrap())
    const { result } = await updateEvaluationResultV2(
      {
        workspace,
        commit,
        result: evaluationResult,
        issue,
      },
      transaction,
    ).then((r) => r.unwrap())

    await upsertHistogram(
      {
        project,
        commit,
        issue,
        date: new Date(),
        documentUuid: evaluation.documentUuid,
      },
      transaction,
    ).then((r) => r.unwrap())

    return Result.ok({ issue, evaluationResult: result })
  })
}
