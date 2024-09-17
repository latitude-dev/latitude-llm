import { Evaluation } from '@latitude-data/core/browser'
import { computeAverageResultOverTimeAction } from '$/actions/evaluationResults/computeAggregatedResults'
import useSWR, { SWRConfiguration } from 'swr'

export default function useAverageResultOverTime(
  {
    evaluation,
    documentUuid,
  }: {
    evaluation: Evaluation
    documentUuid: string
  },
  opts: SWRConfiguration = {},
) {
  const { data, isValidating, isLoading, error } = useSWR(
    ['averageResultOverTime', evaluation.id, documentUuid],
    async () => {
      const [data, error] = await computeAverageResultOverTimeAction({
        documentUuid,
        evaluationId: evaluation.id,
      })

      if (error) return []
      return data
    },
    opts,
  )

  return {
    data,
    isLoading,
    isValidating,
    error,
  }
}
