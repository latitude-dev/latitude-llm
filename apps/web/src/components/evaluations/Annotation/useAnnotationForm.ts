import { useCallback, useMemo, useTransition } from 'react'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultMetadata,
  DocumentLog,
  EvaluationV2,
} from '@latitude-data/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ProviderLogDto } from '@latitude-data/core/schema/types'

type UseAnnontationFormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  providerLog: ProviderLogDto
  documentLog: DocumentLog
  commit: Commit
  isAnnotatingEvaluation: boolean
  annotateEvaluation: ReturnType<typeof useEvaluationsV2>['annotateEvaluation']
  mutateEvaluationResults: ReturnType<
    typeof useEvaluationResultsV2ByDocumentLogs
  >['mutate']
}

export type OnSubmitProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  score: number
  resultMetadata: Partial<EvaluationResultMetadata<T, M>>
}

export function useAnnotationForm<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  isAnnotatingEvaluation,
  annotateEvaluation,
  evaluation,
  providerLog,
  documentLog,
  mutateEvaluationResults,
}: UseAnnontationFormProps<T, M>) {
  const [isSubmitting, startTransition] = useTransition()
  const onSubmit = useCallback(
    async ({ score, resultMetadata }: OnSubmitProps<T, M>) => {
      if (isAnnotatingEvaluation) return

      startTransition(async () => {
        const [annotationResult, errors] = await annotateEvaluation({
          evaluationUuid: evaluation.uuid,
          providerLogUuid: providerLog.uuid,
          resultScore: score,
          resultMetadata,
        })

        if (errors) return

        const { result } = annotationResult
        mutateEvaluationResults((prev) => {
          const prevResults = prev?.[documentLog.uuid] || []
          const existingResult = prevResults.find(
            (r) => r.result.uuid === result.uuid,
          )
          return {
            ...(prev ?? {}),
            [documentLog.uuid]: existingResult
              ? prevResults.map((r) =>
                  r.result.uuid === result.uuid ? { evaluation, result } : r,
                )
              : [{ evaluation, result }, ...prevResults],
          }
        })
      })
    },
    [
      isAnnotatingEvaluation,
      annotateEvaluation,
      evaluation,
      providerLog,
      documentLog,
      mutateEvaluationResults,
    ],
  )

  return useMemo(() => ({ isSubmitting, onSubmit }), [isSubmitting, onSubmit])
}
