import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../../../constants'
import { BadRequestError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { Issue } from '../../../schema/models/types/Issue'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { createIssue } from '../../issues/create'
import { addResultToIssue } from '../../issues/results/add'
import { removeResultFromIssue } from '../../issues/results/remove'

export async function assignEvaluationResultV2ToIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    result,
    evaluation,
    issue,
    create,
    workspace,
  }: {
    result: EvaluationResultV2<T, M> & { embedding?: number[] }
    evaluation: EvaluationV2<T, M>
    issue?: Issue
    create?: Omit<Parameters<typeof createIssue>[0], 'workspace'>
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async () => {
    if (!issue) {
      if (!create) {
        return Result.error(new BadRequestError('No issue was provided'))
      }

      const creating = await createIssue({ ...create, workspace }, transaction)
      if (creating.error) {
        return Result.error(creating.error)
      }

      issue = creating.value.issue
    }

    if (result.issueId) {
      const removing = await removeResultFromIssue(
        {
          result: { result, evaluation, embedding: result.embedding },
          issue: issue,
          workspace: workspace,
        },
        transaction,
      )
      if (removing.error) {
        return Result.error(removing.error)
      }
      issue = removing.value.issue
      result = removing.value.result
    }

    const adding = await addResultToIssue(
      {
        result: { result, evaluation, embedding: result.embedding },
        issue: issue,
        workspace: workspace,
      },
      transaction,
    )
    if (adding.error) {
      return Result.error(adding.error)
    }
    issue = adding.value.issue
    result = adding.value.result

    return Result.ok({ result, issue })
  })
}
