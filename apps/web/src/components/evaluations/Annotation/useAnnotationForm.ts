import { useCallback, useMemo, useTransition } from 'react'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationV2,
  SpanWithDetails,
  MainSpanType,
} from '@latitude-data/constants'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

type UseAnnontationFormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  span: SpanWithDetails<MainSpanType>
  onAnnotate?: (result: EvaluationResultV2<T, M>) => void
  result?: EvaluationResultV2<T, M>
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
>({ evaluation, span, onAnnotate, result }: UseAnnontationFormProps<T, M>) {
  const [isSubmitting, startTransition] = useTransition()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { annotateEvaluation, isAnnotatingEvaluation } = useEvaluationsV2({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: evaluation.documentUuid,
    },
  })
  const { mutate } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: evaluation.documentUuid,
    },
    spanId: span.id,
    documentLogUuid: span.documentLogUuid,
  })
  const onSubmit = useCallback(
    async ({ score, resultMetadata }: OnSubmitProps<T, M>) => {
      if (isAnnotatingEvaluation) return

      startTransition(async () => {
        const [updatedResult, errors] = await annotateEvaluation({
          documentUuid: evaluation.documentUuid,
          evaluationUuid: evaluation.uuid,
          spanId: span.id,
          traceId: span.traceId,
          resultScore: score,
          resultMetadata,
          resultUuid: result?.uuid,
        })

        if (errors) return

        mutate()

        if (updatedResult && onAnnotate) {
          onAnnotate(updatedResult as unknown as EvaluationResultV2<T, M>)
        }
      })
    },
    [
      isAnnotatingEvaluation,
      annotateEvaluation,
      evaluation,
      span,
      mutate,
      onAnnotate,
      result?.uuid,
    ],
  )

  return useMemo(() => ({ isSubmitting, onSubmit }), [isSubmitting, onSubmit])
}
