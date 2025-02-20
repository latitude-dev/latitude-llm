import {
  EvaluationDto,
  EvaluationResultDto,
  EvaluationResultableType,
} from '../../browser'

export function hasEvaluationResultPassed({
  result: { result },
  evaluation,
}: {
  result: EvaluationResultDto
  evaluation: EvaluationDto
}) {
  if (result === undefined) return false

  if (evaluation.resultType === EvaluationResultableType.Boolean) {
    return typeof result === 'string' ? result === 'true' : Boolean(result)
  }

  if (evaluation.resultType === EvaluationResultableType.Number) {
    return Number(result) >= evaluation.resultConfiguration.maxValue
  }

  if (evaluation.resultType === EvaluationResultableType.Text) {
    return String(result).trim() !== ''
  }

  return false
}
