import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'

export function getEnsureEvaluationResultError(
  error: EvaluationResultWithMetadataAndErrors['error'],
) {
  if (!error.code || !error.message) return null

  return {
    code: error.code!,
    message: error.message!,
    details: error.details,
  }
}
