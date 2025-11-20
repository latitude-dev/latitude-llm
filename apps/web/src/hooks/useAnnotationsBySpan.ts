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
  SpanWithDetails,
  SpanType,
} from '@latitude-data/constants'
import useEvaluationResultsV2BySpans from '$/stores/evaluationResultsV2/bySpans'

export type UseAnnotationBySpanProps = {
  project: Project
  commit: Commit
  span: SpanWithDetails<SpanType.Prompt>
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
 *   - `annotations.bottom` - Bottom annotation data if available (evaluation, result, and span)
 *   - `evaluationResults` - All evaluation results for the span
 *   - `mutateResults` - Function to mutate/update evaluation results
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
      document: {
        commitId: commit.id,
        documentUuid: span.documentUuid!,
      },
    })
  const { data: results, isLoading: isLoadingResults } =
    useEvaluationResultsV2BySpans({
      project,
      commit,
      document: {
        commitId: commit.id,
        documentUuid: span.documentUuid!,
      },
      spanId: span.id,
      traceId: span.traceId,
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

  const manualEvaluation = manualEvaluations[0]
  const manualResult = useMemo(() => {
    return results
      .filter(
        (r) =>
          r.result.evaluatedSpanId === span.id &&
          r.result.evaluatedTraceId === span.traceId,
      )
      .reduce<Record<string, EvaluationResultV2>>((acc, r) => {
        const e = manualEvaluations.find((e) => r.evaluation.uuid === e.uuid)
        if (e) acc[r.evaluation.uuid] = r.result

        return acc
      }, {})
  }, [results, span.id, span.traceId, manualEvaluations])

  const isLoading = isLoadingEvaluations || isLoadingResults
  return useMemo(
    () => ({
      annotations: {
        bottom:
          !isLoading && span && manualEvaluation && manualResult
            ? {
                evaluation: manualEvaluation,
                result: manualResult[manualEvaluation?.uuid],
                span,
              }
            : undefined,
      },
      isLoading,
    }),
    [manualEvaluation, manualResult, span, isLoading],
  )
}
