import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import useSWR, { SWRConfiguration } from 'swr'

export default function useProjectStats(
  {
    projectId,
  }: {
    projectId: number
  },
  opts?: SWRConfiguration,
) {
  const fetcher = useFetcher(ROUTES.api.projects.detail(projectId).stats.root)

  const { data, isLoading, error, mutate } = useSWR(
    ['projectStats', projectId],
    fetcher,
    opts,
  )

  return {
    data: data ?? {
      totalTokens: 0,
      totalRuns: 0,
      totalDocuments: 0,
      runsPerModel: {},
      costPerModel: {},
      rollingDocumentLogs: [],
      totalEvaluations: 0,
      totalEvaluationRuns: 0,
      evaluationCosts: [],
    },
    isLoading,
    error,
    refetch: mutate,
  }
}
