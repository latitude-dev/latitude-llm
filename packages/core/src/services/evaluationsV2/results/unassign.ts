import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { Issue } from '../../../schema/models/types/Issue'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { removeResultFromIssue } from '../../issues/results/remove'

export async function unassignEvaluationResultV2FromIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    result,
    evaluation,
    issue,
    workspace,
  }: {
    result: EvaluationResultV2<T, M> & { embedding?: number[] }
    evaluation: EvaluationV2<T, M>
    issue: Issue
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async () => {
    const removing = await removeResultFromIssue(
      {
        workspace,
        issue,
        result: { result, evaluation, embedding: result.embedding },
      },
      transaction,
    )
    if (removing.error) {
      return Result.error(removing.error)
    }
    issue = removing.value.issue
    result = removing.value.result

    return Result.ok({ result, issue })
  })
}
