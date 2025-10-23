import { ResultWithEvaluationV2 } from '@latitude-data/core/schema/types'

/**
 * Check in local collection of evaluation results stored by
 * document log uuuid if there is an evaluation result for
 * evaluation result instance to update, and update it
 * with new issue assignment
 *
 * TODO: This is super complicated, we have a local collection
 * that couple evaluation with evaluation results by document log uuid.
 * This makes things hard to follow. And also we need to change all of
 * this now that we're moving document logs to traces.
 */
export function updateEvaluationResultInstance({
  prev,
  documentLogUuid,
  updatedResultWithEvaluation,
}: {
  prev: Record<string, ResultWithEvaluationV2[]> | undefined
  documentLogUuid: string
  updatedResultWithEvaluation: ResultWithEvaluationV2
}): Record<string, ResultWithEvaluationV2[]> {
  const existingResults = prev ?? {}
  const byDocumentLogUuid = existingResults[documentLogUuid] ?? []
  const existingIndex = byDocumentLogUuid.findIndex(
    ({ evaluation, result }) =>
      evaluation.uuid === updatedResultWithEvaluation.evaluation.uuid &&
      result.id === updatedResultWithEvaluation.result.id,
  )
  let updatedResultsForDocumentLogUuid: ResultWithEvaluationV2[]

  if (existingIndex !== -1) {
    updatedResultsForDocumentLogUuid = [...byDocumentLogUuid]
    updatedResultsForDocumentLogUuid[existingIndex] =
      updatedResultWithEvaluation
  } else {
    updatedResultsForDocumentLogUuid = [
      ...byDocumentLogUuid,
      updatedResultWithEvaluation,
    ]
  }
  return {
    ...existingResults,
    [documentLogUuid]: updatedResultsForDocumentLogUuid,
  }
}
