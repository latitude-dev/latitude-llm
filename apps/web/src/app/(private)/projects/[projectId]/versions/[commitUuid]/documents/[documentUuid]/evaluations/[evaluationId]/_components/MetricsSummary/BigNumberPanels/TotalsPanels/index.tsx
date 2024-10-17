'use client'

import { useCallback } from 'react'

import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import useEvaluationResultsCounters from '$/stores/evaluationResultCharts/evaluationResultsCounters'
import { useDebouncedCallback } from 'use-debounce'

import { useEvaluationStatusEvent } from '../../../../_lib/useEvaluationStatusEvent'
import Panel from '../Panel'

export default function TotalsPanels({
  commitUuid,
  documentUuid,
  evaluationId,
}: {
  commitUuid: string
  documentUuid: string
  evaluationId: number
}) {
  const { data, refetch, isLoading } = useEvaluationResultsCounters(
    {
      commitUuid,
      documentUuid,
      evaluationId,
    },
    {
      revalidateIfStale: false,
    },
  )
  const onStatusChange = useDebouncedCallback(
    useCallback(() => refetch(), [refetch]),
    2000,
    { trailing: true },
  )
  useEvaluationStatusEvent({ evaluationId, documentUuid, onStatusChange })
  const cost =
    data?.costInMillicents === undefined
      ? '-'
      : formatCostInMillicents(data.costInMillicents)

  return (
    <>
      <Panel
        label='Total logs'
        loading={isLoading}
        value={String(data?.totalCount ?? '-')}
      />
      <Panel label='Total cost' loading={isLoading} value={cost} />
      <Panel
        label='Total tokens'
        loading={isLoading}
        value={String(data?.tokens ?? '-')}
      />
    </>
  )
}
