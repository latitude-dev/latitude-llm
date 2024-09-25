'use client'

import { useCallback } from 'react'

import { EvaluationAggregationTotals } from '@latitude-data/core/browser'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useEvaluationResultsCounters from '$/stores/evaluationResultCharts/evaluationResultsCounters'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function TotalsPanels({
  aggregation,
  commitUuid,
  documentUuid,
  evaluationId,
}: {
  commitUuid: string
  documentUuid: string
  evaluationId: number
  aggregation: EvaluationAggregationTotals
}) {
  const { data, refetch } = useEvaluationResultsCounters(
    {
      commitUuid,
      documentUuid,
      evaluationId,
    },
    {
      fallbackData: aggregation,
    },
  )
  const onStatusChange = useCallback(() => refetch(), [refetch])
  useEvaluationStatusEvent({ evaluationId, documentUuid, onStatusChange })
  const cost =
    data?.costInMillicents === undefined
      ? '-'
      : formatCostInMillicents(data.costInMillicents)
  return (
    <>
      <Panel label='Total logs' value={String(data?.totalCount ?? '-')} />
      <Panel label='Total cost' value={cost} />
      <Panel label='Total tokens' value={String(data?.tokens ?? '-')} />
    </>
  )
}
