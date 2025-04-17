import { EvaluationV2 } from '@latitude-data/constants'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { getEvaluationMetricSpecification } from '../evaluationsV2/specifications'

export function assertEvaluationRequirements({
  evaluations,
  datasetLabels,
}: {
  evaluations: EvaluationV2[]
  datasetLabels: Record<string, string>
}): TypedResult<undefined, LatitudeError> {
  for (const evaluation of evaluations) {
    const spec = getEvaluationMetricSpecification(evaluation)
    if (!spec.supportsBatchEvaluation) {
      return Result.error(
        new BadRequestError(
          `Evaluation ${evaluation.name} cannot be run as an experiment`,
        ),
      )
    }

    const datasetLabel = datasetLabels[evaluation.uuid]
    if (spec.requiresExpectedOutput && !datasetLabel) {
      return Result.error(
        new BadRequestError(
          `Evaluation ${evaluation.name} requires an expected output column`,
        ),
      )
    }
  }

  return Result.nil()
}
