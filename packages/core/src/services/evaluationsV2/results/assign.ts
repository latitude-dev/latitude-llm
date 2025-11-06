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
import { validateResultForIssue } from '../../issues/results/validate'
import { reassignResultFromIssue } from './reassignFromIssue'

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
  return await transaction.call(async (db) => {
    const validating = await validateResultForIssue(
      {
        result: { result, evaluation },
        issue,
        skipBelongsCheck: true, // We'll check this later in reassignResultFromIssue
      },
      db,
    )
    if (!Result.isOk(validating)) return validating

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

    return await reassignResultFromIssue(
      {
        workspace,
        result,
        evaluation,
        targetIssue: issue,
      },
      transaction,
    )
  })
}
