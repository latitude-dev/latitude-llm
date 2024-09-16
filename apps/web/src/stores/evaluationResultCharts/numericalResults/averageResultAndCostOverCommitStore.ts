import { Evaluation } from '@latitude-data/core/browser'
import { computeAverageResultAndCostOverCommitAction } from '$/actions/evaluationResults/computeAggregatedResults'
import useSWR, { SWRConfiguration } from 'swr'

export default function useAverageResultsAndCostOverCommit(
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
    ['averageResultAndCostOverCommit', evaluation.id, documentUuid],
    async () => {
      const [data, error] = await computeAverageResultAndCostOverCommitAction({
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
