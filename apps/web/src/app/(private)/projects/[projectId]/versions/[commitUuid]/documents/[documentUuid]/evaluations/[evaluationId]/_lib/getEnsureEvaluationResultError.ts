import { RunErrorCodes } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'

export function getEnsureEvaluationResultError<T extends RunErrorCodes>(
  error: EvaluationResultWithMetadataAndErrors<T>['error'],
) {
  if (!error.code || !error.message) return null

  return {
    code: error.code,
    message: error.message!,
    details: error.details
  }
}
