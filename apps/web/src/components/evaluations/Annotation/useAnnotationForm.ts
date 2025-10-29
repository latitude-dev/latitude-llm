import { useCallback, useMemo, useTransition } from 'react'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationV2,
  SpanWithDetails,
  SpanType,
} from '@latitude-data/constants'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

type UseAnnontationFormProps<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  span: SpanWithDetails<SpanType.Prompt>
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
>({ evaluation, span }: UseAnnontationFormProps<T, M>) {
  const [isSubmitting, startTransition] = useTransition()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()
  const { annotateEvaluation, isAnnotatingEvaluation } = useEvaluationsV2({
    project,
    commit,
    document,
  })
  const { mutate } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document,
    spanId: span.id,
    traceId: span.traceId,
  })
  const onSubmit = useCallback(
    async ({ score, resultMetadata }: OnSubmitProps<T, M>) => {
      if (isAnnotatingEvaluation) return

      startTransition(async () => {
        const [_, errors] = await annotateEvaluation({
          evaluationUuid: evaluation.uuid,
          spanId: span.id,
          traceId: span.traceId,
          resultScore: score,
          resultMetadata,
        })
        if (errors) return

        mutate()
      })
    },
    [isAnnotatingEvaluation, annotateEvaluation, evaluation, span, mutate],
  )

  return useMemo(() => ({ isSubmitting, onSubmit }), [isSubmitting, onSubmit])
}
