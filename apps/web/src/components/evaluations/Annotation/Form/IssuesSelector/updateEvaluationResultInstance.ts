import { ResultWithEvaluationV2AndIssue } from '@latitude-data/core/schema/types'

/**
 * Updates an evaluation result instance in a local collection of evaluation results
 * stored by span. Finds the matching evaluation result by evaluated span ID and
 * trace ID (similar to how it was previously found by document log UUID).
 */
export function updateEvaluationResultInstance({
  prev,
  updatedResultWithEvaluation,
}: {
  prev: ResultWithEvaluationV2AndIssue[] | undefined
  updatedResultWithEvaluation: ResultWithEvaluationV2AndIssue
}): ResultWithEvaluationV2AndIssue[] {
  const existingResults = prev ?? []
  const { evaluatedSpanId, evaluatedTraceId } =
    updatedResultWithEvaluation.result

  const existingIndex = existingResults.findIndex(
    ({ result }) =>
      result.evaluatedSpanId === evaluatedSpanId &&
      result.evaluatedTraceId === evaluatedTraceId,
  )

  if (existingIndex !== -1) {
    const updated = [...existingResults]
    updated[existingIndex] = updatedResultWithEvaluation
    return updated
  }

  return [...existingResults, updatedResultWithEvaluation]
}
