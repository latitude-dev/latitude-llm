import { database } from '../../../client'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
} from '../../../constants'
import { UnprocessableEntityError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { IssueEvaluationResultsRepository } from '../../../repositories'
import { type Issue } from '../../../schema/models/types/Issue'
import { type ResultWithEvaluationV2 } from '../../../schema/types'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'

export async function validateResultForIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    result: { result, evaluation },
    issue,
    skipBelongsCheck = false,
    skipReasonCheck = false,
    skipPassedCheck = false,
  }: {
    result: ResultWithEvaluationV2<T, M>
    issue?: Issue
    skipBelongsCheck?: boolean
    skipReasonCheck?: boolean
    skipPassedCheck?: boolean
  },
  db = database,
) {
  // Note: VERY important checks, think twice before changing them!

  if (result.error) {
    return Result.error(
      new UnprocessableEntityError('Cannot use a result that has errored'),
    )
  }

  if (result.hasPassed && !skipPassedCheck) {
    return Result.error(
      new UnprocessableEntityError('Cannot use a result that has passed'),
    )
  }

  if (!skipBelongsCheck) {
    // Check if result already belongs to an issue via intermediate table
    const repository = new IssueEvaluationResultsRepository(
      result.workspaceId,
      db,
    )
    const activeAssignedIssue = await repository.findLastActiveAssignedIssue({
      result,
    })

    if (activeAssignedIssue) {
      return Result.error(
        new UnprocessableEntityError(
          'Cannot use a result that already belongs to an issue',
        ),
      )
    }
  }

  // TODO(AO): Review why do we want to allow results from experiments to be added to issues?
  // if (result.experimentId) {
  //   return Result.error(
  //     new UnprocessableEntityError('Cannot use a result from an experiment'),
  //   )
  // }

  if (evaluation.type === EvaluationType.Composite) {
    return Result.error(
      new UnprocessableEntityError(
        'Cannot use a result from a composite evaluation',
      ),
    )
  }

  const specification = getEvaluationMetricSpecification(evaluation)
  const reason = specification.resultReason(
    result as EvaluationResultSuccessValue<T, M>,
  )
  if (!reason && !skipReasonCheck) {
    return Result.error(
      new UnprocessableEntityError('Cannot use a result that has no reasoning'),
    )
  }

  if (issue && issue.mergedAt) {
    return Result.error(
      new UnprocessableEntityError('Cannot use an issue that has been merged'),
    )
  }

  return Result.ok(true)
}
