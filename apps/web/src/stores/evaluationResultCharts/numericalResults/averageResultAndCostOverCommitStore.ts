import {
  AverageResultAndCostOverCommit,
  Evaluation,
} from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR from 'swr'

export default function useAverageResultsAndCostOverCommit({
  evaluation,
  documentUuid,
  projectId,
  commitUuid,
}: {
  evaluation: Evaluation
  documentUuid: string
  projectId: number
  commitUuid: string
}) {
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId: evaluation.id }).evaluationResults
      .averageAndCost,
  )
  const { data, isValidating, isLoading, error, mutate } = useSWR<
    AverageResultAndCostOverCommit[]
  >(['averageResultAndCostOverCommit', evaluation.id, documentUuid], fetcher)

  return {
    data,
    isLoading,
    isValidating,
    error,
    refetch: mutate,
  }
}
