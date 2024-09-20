'use client'

import { EvaluationAggregationTotals } from '@latitude-data/core/browser'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useEvaluationResultsCounters from '$/stores/evaluationResultCharts/evaluationResultsCounters'

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
  const { data } = useEvaluationResultsCounters(
    {
      commitUuid,
      documentUuid,
      evaluationId,
    },
    {
      fallbackData: aggregation,
    },
  )
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
