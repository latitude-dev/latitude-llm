import { useCallback } from 'react'

import { Evaluation } from '@latitude-data/core/browser'
import { computeAverageResultOverTimeAction } from '$/actions/evaluationResults/computeAggregatedResults'
import useSWR from 'swr'

export default function useAverageResultOverTime({
  evaluation,
  documentUuid,
}: {
  evaluation: Evaluation
  documentUuid: string
}) {
  const fetcher = useCallback(async () => {
    const [data, error] = await computeAverageResultOverTimeAction({
      documentUuid,
      evaluationId: evaluation.id,
    })

    if (error) return []
    return data
  }, [documentUuid, evaluation.id])
  const { data, isValidating, isLoading, error, mutate } = useSWR(
    ['averageResultOverTime', evaluation.id, documentUuid],
    fetcher,
  )

  return {
    data,
    isLoading,
    isValidating,
    error,
    refetch: mutate,
  }
}
