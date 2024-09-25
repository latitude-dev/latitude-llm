import { useCallback } from 'react'

import {
  DocumentVersion,
  Evaluation,
  EvaluationResultableType,
} from '@latitude-data/core/browser'
import { useCurrentCommit } from '@latitude-data/web-ui'
import useEvaluationResultsCounters from '$/stores/evaluationResultCharts/evaluationResultsCounters'
import useEvaluationResultsMeanValue from '$/stores/evaluationResultCharts/evaluationResultsMeanValue'
import useEvaluationResultsModalValue from '$/stores/evaluationResultCharts/evaluationResultsModalValue'
import useAverageResultsAndCostOverCommit from '$/stores/evaluationResultCharts/numericalResults/averageResultAndCostOverCommitStore'
import useAverageResultOverTime from '$/stores/evaluationResultCharts/numericalResults/averageResultOverTimeStore'

export function useRefetchStats({
  evaluation,
  document,
}: {
  evaluation: Evaluation
  document: DocumentVersion
}) {
  const { commit } = useCurrentCommit()
  const evaluationId = evaluation.id
  const commitUuid = commit.uuid
  const documentUuid = document.documentUuid
  const isNumeric =
    evaluation.configuration.type === EvaluationResultableType.Number

  const { refetch: refetchAverageResulstAndCostsOverCommit } =
    useAverageResultsAndCostOverCommit({
      evaluation,
      documentUuid,
    })
  const { refetch: refetchAverageResultOverTime } = useAverageResultOverTime({
    evaluation,
    documentUuid,
  })
  const { refetch: refetchMean } = useEvaluationResultsMeanValue({
    commitUuid,
    documentUuid,
    evaluationId,
  })
  const { refetch: refetchModal } = useEvaluationResultsModalValue({
    commitUuid,
    documentUuid,
    evaluationId,
  })
  const { refetch: refetchTotals } = useEvaluationResultsCounters({
    commitUuid,
    documentUuid,
    evaluationId,
  })

  const refetchStats = useCallback(() => {
    console.log('refetchStats')

    Promise.all([
      refetchTotals(),
      ...(isNumeric
        ? [
            refetchMean(),
            refetchAverageResulstAndCostsOverCommit(),
            refetchAverageResultOverTime(),
          ]
        : [refetchModal()]),
    ])
  }, [
    isNumeric,
    refetchMean,
    refetchModal,
    refetchTotals,
    refetchAverageResulstAndCostsOverCommit,
    refetchAverageResultOverTime,
  ])

  return {
    refetchStats,
  }
}
