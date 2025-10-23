import { Project } from '@latitude-data/core/schema/models/types/Project'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { ProviderLogDto } from '@latitude-data/core/schema/types'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { useMemo } from 'react'
import {
  EvaluationConfiguration,
  EvaluationResultV2,
  EvaluationType,
  HumanEvaluationMetric,
} from '@latitude-data/constants'
import useEvaluationResultsV2ByDocumentLogs from '$/stores/evaluationResultsV2/byDocumentLogs'

export type UseUIAnnotationsProps = {
  project: Project
  commit: Commit
  documentLog: { uuid: string; documentUuid: string }
  providerLog: ProviderLogDto | undefined
}

/**
 * Get the evaluations that are configured for annotating on Latitude UI.
 * These are human evaluations with configuration `enableControls: true`.
 */
export function useUIAnnotations({
  commit,
  project,
  documentLog,
  providerLog,
}: UseUIAnnotationsProps) {
  const {
    data: evaluations,
    isLoading: isLoadingEvaluations,
    annotateEvaluation,
    isAnnotatingEvaluation,
  } = useEvaluationsV2({
    project,
    commit,
    document: {
      commitId: commit.id,
      documentUuid: documentLog.documentUuid,
    },
  })
  const {
    data: results,
    isLoading: isLoadingResults,
    mutate: mutateResults,
  } = useEvaluationResultsV2ByDocumentLogs({
    project: project,
    commit: commit,
    document: {
      commitId: commit.id,
      documentUuid: documentLog.documentUuid,
    },
    documentLogUuids: [documentLog.uuid],
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
    if (!results[documentLog.uuid]) return {}

    return results[documentLog.uuid].reduce<Record<string, EvaluationResultV2>>(
      (acc, r) => {
        const e = manualEvaluations.find((e) => r.evaluation.uuid === e.uuid)

        if (e) acc[r.evaluation.uuid] = r.result

        return acc
      },
      {},
    )
  }, [results, documentLog.uuid, manualEvaluations])

  const isLoading = isLoadingEvaluations || isLoadingResults
  return useMemo(
    () => ({
      annotations: {
        bottom:
          !isLoading && providerLog && manualEvaluation && manualResult
            ? {
                evaluation: manualEvaluation,
                result: manualResult[manualEvaluation?.uuid],
                providerLog,
              }
            : undefined,
      },
      evaluationResults: results,
      mutateResults,
      isLoading,
      annotateEvaluation,
      isAnnotatingEvaluation,
    }),
    [
      results,
      manualEvaluation,
      manualResult,
      annotateEvaluation,
      isAnnotatingEvaluation,
      mutateResults,
      providerLog,
      isLoading,
    ],
  )
}
