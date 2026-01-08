import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useMemo } from 'react'
import {
  EvaluationConfiguration,
  EvaluationResultV2,
  EvaluationType,
  HumanEvaluationMetric,
  Span,
} from '@latitude-data/constants'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'

export type UseAnnotationBySpanProps = {
  project: Project
  commit: Commit
  span?: Span
}

/**
 * Hook for managing UI annotations and evaluation results for a specific span.
 *
 * Fetches evaluations and evaluation results for the given span, filters for manual
 * evaluations that support manual annotation with controls enabled, and provides
 * annotation data and mutation functions for updating evaluation results.
 *
 * @param props - Configuration object for the hook
 * @param props.project - The project containing the span
 * @param props.commit - The commit containing the span
 * @param props.span - The span to fetch annotations for (must be a Prompt span)
 * @returns Object containing:
 *   - `annotations` - Array of annotation data (evaluation, result, and span)
 *   - `isLoading` - Whether evaluations or results are currently loading
 */
export function useAnnotationBySpan({
  commit,
  project,
  span,
}: UseAnnotationBySpanProps) {
  const { data: evaluations, isLoading: isLoadingEvaluations } =
    useEvaluationsV2({
      project,
      commit,
      document:
        span && span.documentUuid
          ? {
              commitId: commit.id,
              documentUuid: span.documentUuid,
            }
          : undefined,
    })
  const { data: results, isLoading: isLoadingResults } =
    useEvaluationResultsV2BySpans({
      project,
      commit,
      document:
        span && span.documentUuid
          ? {
              commitId: commit.id,
              documentUuid: span.documentUuid,
            }
          : undefined,
      spanId: span?.id,
      documentLogUuid: span?.documentLogUuid,
    })
  const manualEvaluations = useMemo(
    () =>
      evaluations.filter((e) => {
        const supportManual =
          getEvaluationMetricSpecification(e).supportsManualEvaluation
        if (!supportManual) return false

        const config = e.configuration as EvaluationConfiguration<
          EvaluationType.Human,
          HumanEvaluationMetric
        >
        return config.enableControls === true
      }),
    [evaluations],
  )

  const annotations = useMemo(() => {
    if (isLoadingEvaluations || isLoadingResults || !span) return []

    return results
      .filter(
        (r) =>
          r.result.evaluatedSpanId === span.id &&
          r.result.evaluatedTraceId === span.traceId,
      )
      .map((r) => {
        const evaluation = manualEvaluations.find(
          (e) => r.evaluation.uuid === e.uuid,
        )
        if (!evaluation) return null

        return {
          evaluation,
          result: r.result,
          span,
        }
      })
      .filter((a) => a !== null) as Array<{
      evaluation: ReturnType<typeof useEvaluationsV2>['data'][number]
      result: EvaluationResultV2
      span: typeof span
    }>
  }, [results, span, manualEvaluations, isLoadingEvaluations, isLoadingResults])

  const isLoading = isLoadingEvaluations || isLoadingResults
  return useMemo(
    () => ({
      evaluations: manualEvaluations,
      annotations,
      isLoading,
    }),
    [annotations, manualEvaluations, isLoading],
  )
}
