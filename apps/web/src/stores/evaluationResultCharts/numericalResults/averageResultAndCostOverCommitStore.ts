import {
  AverageResultAndCostOverCommit,
  Evaluation,
} from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useAverageResultsAndCostOverCommit(
  {
    evaluation,
    documentUuid,
    projectId,
    commitUuid,
  }: {
    evaluation: Evaluation
    documentUuid: string
    projectId: number
    commitUuid: string
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher<AverageResultAndCostOverCommit[]>(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId: evaluation.id }).evaluationResults
      .averageAndCost,
  )
  const { data, isValidating, isLoading, error, mutate } = useSWR(
    ['averageResultAndCostOverCommit', evaluation.id, documentUuid],
    fetcher,
    opts,
  )

  return {
    data,
    isLoading,
    isValidating,
    error,
    refetch: mutate,
  }
}
