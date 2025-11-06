import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
} from '../../../constants'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import {
  IssueEvaluationResultsRepository,
  IssuesRepository,
} from '../../../repositories'
import { Issue } from '../../../schema/models/types/Issue'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { addResultToIssue } from '../../issues/results/add'
import { removeResultFromIssue } from '../../issues/results/remove'

/**
 * Reassigns an evaluation result to a target issue.
 *
 * This service handles the complete reassignment flow:
 * 1. Checks if the result is already assigned to an issue
 * 2. If found, removes the result from the current issue
 * 3. Adds the result to the target issue
 */
export async function reassignResultFromIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    workspace,
    result,
    evaluation,
    targetIssue,
  }: {
    workspace: Workspace
    result: EvaluationResultV2<T, M> & { embedding?: number[] }
    evaluation: EvaluationV2<T, M>
    targetIssue: Issue
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    const issueEvalResultsRepo = new IssueEvaluationResultsRepository(
      workspace.id,
      tx,
    )
    const existingAssociation =
      await issueEvalResultsRepo.findLastActiveAssignedIssue({
        result,
      })

    if (existingAssociation) {
      // Result is already assigned to an issue, need to remove it first
      const issuesRepository = new IssuesRepository(workspace.id, tx)
      const currentIssueResult = await issuesRepository.find(
        existingAssociation.issueId,
      )
      if (!Result.isOk(currentIssueResult)) return currentIssueResult

      const currentIssue = currentIssueResult.value

      const removing = await removeResultFromIssue(
        {
          workspace,
          issue: currentIssue,
          result: { result, evaluation, embedding: result.embedding },
        },
        transaction,
      )
      if (!Result.isOk(removing)) return removing

      result = removing.value.result
    }

    return addResultToIssue(
      {
        result: { result, evaluation, embedding: result.embedding },
        issue: targetIssue,
        workspace,
      },
      transaction,
    )
  })
}
