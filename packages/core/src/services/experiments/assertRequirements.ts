import { EvaluationV2 } from '@latitude-data/constants'
import { BadRequestError, LatitudeError, Result, TypedResult } from '../../lib'
import { getEvaluationMetricSpecification } from '../evaluationsV2'

export function assertEvaluationRequirements({
  evaluations,
  expectedOutputColumn,
}: {
  evaluations: EvaluationV2[]
  expectedOutputColumn?: string
}): TypedResult<undefined, LatitudeError> {
  const evalSpecs = evaluations.map(getEvaluationMetricSpecification)

  const unsupportedEvalIdx = evalSpecs.findIndex(
    (e) => !e.supportsBatchEvaluation,
  )
  if (unsupportedEvalIdx !== -1) {
    const unsupportedEval = evaluations[unsupportedEvalIdx]!
    return Result.error(
      new BadRequestError(
        `Evaluation ${unsupportedEval.name} cannot be run as an experiment`,
      ),
    )
  }

  if (!expectedOutputColumn) {
    const evalWithRequiredOutputIdx = evalSpecs.findIndex(
      (e) => e.requiresExpectedOutput,
    )
    if (evalWithRequiredOutputIdx !== -1) {
      const evalWithRequiredOutput = evaluations[evalWithRequiredOutputIdx]!
      return Result.error(
        new BadRequestError(
          `Evaluation ${evalWithRequiredOutput.name} requires an expected output column`,
        ),
      )
    }
  }

  return Result.nil()
}
