import { useCallback, useMemo, useTransition } from 'react'
import {
  EvaluationType,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationV2,
  SpanWithDetails,
  SpanType,
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
  span: SpanWithDetails<SpanType.Prompt>
  onAnnotate?: (result: EvaluationResultV2<T, M>) => void
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
>({ evaluation, span, onAnnotate }: UseAnnontationFormProps<T, M>) {
  const [isSubmitting, startTransition] = useTransition()
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { annotateEvaluation, isAnnotatingEvaluation } = useEvaluationsV2({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: span.documentUuid!,
    },
  })
  const { mutate } = useEvaluationResultsV2BySpans({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: span.documentUuid!,
    },
    spanId: span.id,
    traceId: span.traceId,
  })
  const onSubmit = useCallback(
    async ({ score, resultMetadata }: OnSubmitProps<T, M>) => {
      if (isAnnotatingEvaluation) return

      startTransition(async () => {
        const [result, errors] = await annotateEvaluation({
          evaluationUuid: evaluation.uuid,
          spanId: span.id,
          traceId: span.traceId,
          resultScore: score,
          resultMetadata,
        })

        if (errors) return

        mutate()

        if (result && onAnnotate) {
          onAnnotate(result as unknown as EvaluationResultV2<T, M>)
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
    ],
  )

  return useMemo(() => ({ isSubmitting, onSubmit }), [isSubmitting, onSubmit])
}
