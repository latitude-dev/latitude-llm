import { AverageResultOverTime, Evaluation } from '@latitude-data/core/browser'
import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useAverageResultOverTime(
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
  const fetcher = useFetcher(
    ROUTES.api.projects
      .detail(projectId)
      .commits.detail(commitUuid)
      .documents.detail(documentUuid)
      .evaluations.detail({ evaluationId: evaluation.id }).evaluationResults
      .average,
    { serializer: (rows) => rows.map(deserialize) },
  )
  const { data, isValidating, isLoading, error, mutate } = useSWR<
    AverageResultOverTime[]
  >(['averageResultOverTime', evaluation.id, documentUuid], fetcher, opts)

  return {
    data,
    isLoading,
    isValidating,
    error,
    refetch: mutate,
  }
}

function deserialize(item: AverageResultOverTime) {
  return {
    date: new Date(item.date),
    averageResult: item.averageResult,
    count: item.count,
  }
}
